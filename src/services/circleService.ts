import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import {
  ARC_USDC_CONTRACT_ADDRESS,
  BASE_USDC_CONTRACT_ADDRESS,
  ARC_NETWORK,
  BASE_NETWORK,
  DCW_BLOCKCHAIN_ARC,
  DCW_BLOCKCHAIN_BASE,
  UB_CHAIN_ARC,
  UB_CHAIN_BASE,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/chains";
import { MARKETPLACE_SETTLE_TIMEOUT_MS } from "@/server/config/api-timeouts";
import { dcwBlockchainsForApiKey } from "@/lib/circle-dcw-blockchains";
import { getServerEnv, isCircleConfigured } from "@/server/config/env";
import { userStore } from "@/server/storage/user-store";
import { findExistingCircleWalletForClerk } from "@/server/services/circle-wallet-lookup";
import { payX402Resource, type X402PayRequestInit } from "@/server/services/x402-master-pay";
import type { ChainBalanceBreakdown, UnifiedBalanceSnapshot } from "@/lib/wallet-types";

export type { ChainBalanceBreakdown, UnifiedBalanceSnapshot } from "@/lib/wallet-types";

const PAYMENT_MAX_RETRIES = 2;

export { executeUserToMasterTransfer } from "@/server/services/usdc-transfer";

let dcwClient: ReturnType<typeof initiateDeveloperControlledWalletsClient> | undefined;
function getDcwClient() {
  if (!dcwClient) {
    const env = getServerEnv();
    dcwClient = initiateDeveloperControlledWalletsClient({
      apiKey: env.CIRCLE_API_KEY,
      entitySecret: env.ENTITY_SECRET,
    });
  }
  return dcwClient;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => CircleServiceError,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/** When on-chain balance fetch fails, do not trust ledger — treat as 0 for payments. */
function emptyOnChainBalance(): UnifiedBalanceSnapshot {
  return {
    totalUsdc: 0,
    totalConfirmedBalance: "0",
    breakdown: [],
  };
}

/** On-chain USDC per chain via Developer-Controlled Wallets. */
async function fetchUnifiedBalanceViaDcw(walletId: string): Promise<UnifiedBalanceSnapshot> {
  const client = getDcwClient();
  const response = await client.getWalletTokenBalance({
    id: walletId,
    tokenAddresses: [BASE_USDC_CONTRACT_ADDRESS, ARC_USDC_CONTRACT_ADDRESS],
  });

  const tokens = response.data?.tokenBalances ?? [];
  const byChain = new Map<SupportedChainId, number>();

  for (const row of tokens) {
    const blockchain = row.token?.blockchain;
    const address = row.token?.tokenAddress?.toLowerCase();
    const amount = parseUsdcAmount(row.amount);
    if (!amount) continue;

    if (
      blockchain === DCW_BLOCKCHAIN_BASE &&
      address === BASE_USDC_CONTRACT_ADDRESS.toLowerCase()
    ) {
      byChain.set(BASE_NETWORK.id, (byChain.get(BASE_NETWORK.id) ?? 0) + amount);
    }
    if (
      blockchain === DCW_BLOCKCHAIN_ARC &&
      address === ARC_USDC_CONTRACT_ADDRESS.toLowerCase()
    ) {
      byChain.set(ARC_NETWORK.id, (byChain.get(ARC_NETWORK.id) ?? 0) + amount);
    }
  }

  const breakdown: ChainBalanceBreakdown[] = [];
  let total = 0;

  if (byChain.has(BASE_NETWORK.id)) {
    const amt = byChain.get(BASE_NETWORK.id)!;
    total += amt;
    breakdown.push({
      chain: UB_CHAIN_BASE,
      chainId: BASE_NETWORK.id,
      confirmedBalance: amt.toFixed(6),
    });
  }
  if (byChain.has(ARC_NETWORK.id)) {
    const amt = byChain.get(ARC_NETWORK.id)!;
    total += amt;
    breakdown.push({
      chain: UB_CHAIN_ARC,
      chainId: ARC_NETWORK.id,
      confirmedBalance: amt.toFixed(6),
    });
  }

  return {
    totalUsdc: total,
    totalConfirmedBalance: total.toFixed(6),
    breakdown,
  };
}

export type EmbeddedWalletInfo = {
  userId: string;
  circleWalletId: string;
  /** Same EVM address on Base and Arc (Circle wallet set) */
  address: string;
  ledgerBalance: number;
  unifiedBalance: UnifiedBalanceSnapshot;
  usdcContractAddress: string;
};

export { CircleServiceError } from "@/services/circle-errors";
import { CircleServiceError } from "@/services/circle-errors";

function parseUsdcAmount(value: string | undefined): number {
  if (!value) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Aggregated Gateway USDC across Base + Arc Testnet for a depositor address.
 */
export async function getUnifiedBalance(walletId: string): Promise<UnifiedBalanceSnapshot> {
  const user = userStore.getByWalletId(walletId);
  if (!user) {
    throw new CircleServiceError(`Unknown user wallet id: ${walletId}`, "WALLET_NOT_FOUND");
  }

  try {
    return await fetchUnifiedBalanceViaDcw(walletId);
  } catch (error) {
    if (error instanceof CircleServiceError) throw error;
    console.warn("[circleService] balance fetch failed, using ledger:", error);
    return emptyOnChainBalance();
  }
}

/**
 * Creates (or returns) a per-user EOA on Base + Arc Testnet — one address on both chains.
 */
export async function createUserEmbeddedWallet(userId: string): Promise<EmbeddedWalletInfo> {
  const existing = userStore.getByUserId(userId);
  if (existing) {
    const unified = await getUnifiedBalance(existing.circleWalletId);
    const { getOnchainSettlementHoldUsdc } = await import(
      "@/server/services/onchain-settlement"
    );
    const hold = getOnchainSettlementHoldUsdc(userId);
    const synced = userStore.reconcileDepositsFromOnChain(
      userId,
      unified.totalUsdc,
      hold,
    );
    return buildWalletInfo(synced, unified);
  }

  const env = getServerEnv();
  const client = getDcwClient();

  const reused = await findExistingCircleWalletForClerk(
    client,
    env.CIRCLE_WALLET_SET_ID,
    userId,
  );
  if (reused) {
    let unified: UnifiedBalanceSnapshot;
    try {
      unified = await getUnifiedBalance(reused.id);
    } catch {
      unified = {
        totalUsdc: reused.usdcBalance,
        totalConfirmedBalance: String(reused.usdcBalance),
        breakdown: [],
      };
    }
    const { getOnchainSettlementHoldUsdc } = await import(
      "@/server/services/onchain-settlement"
    );
    const hold = getOnchainSettlementHoldUsdc(userId);
    userStore.upsertFromClerk({
      clerkId: userId,
      circleWalletId: reused.id,
      address: reused.address,
      ledgerBalance: unified.totalUsdc,
    });
    const synced = userStore.reconcileDepositsFromOnChain(
      userId,
      unified.totalUsdc,
      hold,
    );
    console.info(
      `[circleService] Re-linked existing Circle wallet ${reused.address} for ${userId}`,
    );
    return buildWalletInfo(synced, unified);
  }

  const blockchains = dcwBlockchainsForApiKey(env.CIRCLE_API_KEY);

  const walletsResponse = await client.createWallets({
    accountType: "EOA",
    blockchains: [...blockchains],
    count: 1,
    walletSetId: env.CIRCLE_WALLET_SET_ID,
    idempotencyKey: randomUUID(),
    metadata: [{ name: "bookanai-user", refId: userId }],
  });

  const wallet = walletsResponse.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) {
    throw new CircleServiceError(
      "Circle did not return a wallet for embedded user",
      "SETTLEMENT_FAILED",
    );
  }

  let unified: UnifiedBalanceSnapshot;
  try {
    unified = await getUnifiedBalance(wallet.id);
  } catch {
    unified = {
      totalUsdc: 0,
      totalConfirmedBalance: "0",
      breakdown: [],
    };
  }

  const synced = userStore.upsertFromClerk({
    clerkId: userId,
    circleWalletId: wallet.id,
    address: wallet.address,
    ledgerBalance: unified.totalUsdc,
  });

  return buildWalletInfo(synced, unified);
}

/** Provision Circle wallet + upsert SQLite + sync on-chain USDC (call on login / GET wallet). */
export async function ensureClerkUserWalletSynced(clerkId: string): Promise<EmbeddedWalletInfo> {
  return createUserEmbeddedWallet(clerkId);
}

function buildWalletInfo(
  record: { userId: string; circleWalletId: string; address: string; ledgerBalance: number },
  unified: UnifiedBalanceSnapshot,
): EmbeddedWalletInfo {
  return {
    userId: record.userId,
    circleWalletId: record.circleWalletId,
    address: record.address,
    ledgerBalance: record.ledgerBalance,
    unifiedBalance: unified,
    usdcContractAddress: ARC_USDC_CONTRACT_ADDRESS,
  };
}

export async function getOrCreateUserWallet(userId: string): Promise<EmbeddedWalletInfo> {
  return createUserEmbeddedWallet(userId);
}

export type NanopaymentResult = {
  agentServiceId: string;
  resourceUrl: string;
  targetChainId: SupportedChainId;
  chargedUsdc: number;
  ledgerBalance: number;
  unifiedBalance: number;
  responseStatus: number;
  responsePreview: string;
  /** Full API body for frontend formatting */
  rawResponse: string;
  generatedContent: string;
  paymentRequiredObserved: boolean;
  /** Circle DCW user→master transfer id when settled on-chain */
  onChainSettlementTxId?: string;
  /** Queued batched settlement id (on-chain transfer runs async) */
  onChainSettlementQueuedId?: string;
};

async function settleWithMasterAgent(
  resourceUrl: string,
  targetChainId: SupportedChainId,
  minUsdc: number,
  payOptions?: X402PayRequestInit,
): Promise<{ status?: number; data?: unknown }> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= PAYMENT_MAX_RETRIES; attempt++) {
    try {
      return await payX402Resource(resourceUrl, targetChainId, minUsdc, payOptions);
    } catch (error) {
      lastError = error;
      if (error instanceof CircleServiceError) throw error;
      if (attempt < PAYMENT_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new CircleServiceError(
    `Master agent settlement failed on chain ${targetChainId}: ${message}`,
    "SETTLEMENT_FAILED",
  );
}

export async function settleWithMasterAgentBounded(
  resourceUrl: string,
  targetChainId: SupportedChainId,
  minUsdc: number,
  payOptions?: X402PayRequestInit,
): Promise<{ status?: number; data?: unknown }> {
  return withTimeout(
    settleWithMasterAgent(resourceUrl, targetChainId, minUsdc, payOptions),
    MARKETPLACE_SETTLE_TIMEOUT_MS,
    () =>
      new CircleServiceError(
        `AI Agent Marketplace did not respond within ${MARKETPLACE_SETTLE_TIMEOUT_MS}ms`,
        "TIMEOUT",
      ),
  );
}

export function circleRuntimeReady(): boolean {
  return isCircleConfigured();
}

export { BASE_USDC_CONTRACT_ADDRESS, ARC_USDC_CONTRACT_ADDRESS, BASE_NETWORK, ARC_NETWORK };
