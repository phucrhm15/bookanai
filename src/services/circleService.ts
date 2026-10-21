import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import {
  ARC_USDC_CONTRACT_ADDRESS,
  ARC_MAINNET_USDC_CONTRACT_ADDRESS,
  BASE_USDC_CONTRACT_ADDRESS,
  ARC_NETWORK,
  ARC_MAINNET_NETWORK,
  BASE_NETWORK,
  DCW_BLOCKCHAIN_ARC,
  DCW_BLOCKCHAIN_ARC_MAINNET,
  DCW_BLOCKCHAIN_BASE,
  UB_CHAIN_ARC,
  UB_CHAIN_ARC_MAINNET,
  UB_CHAIN_BASE,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/chains";
import { MARKETPLACE_SETTLE_TIMEOUT_MS } from "@/server/config/api-timeouts";
import { dcwBlockchainsForApiKey, isLiveCircleApiKey } from "@/lib/circle-dcw-blockchains";
import { getServerEnv, isCircleConfigured } from "@/server/config/env";
import { userStore } from "@/server/storage/user-store";
import {
  findCircleWalletIdForClerkBlockchain,
  findExistingCircleWalletForClerk,
} from "@/server/services/circle-wallet-lookup";
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
  const user = userStore.getByWalletId(walletId);
  if (!user) throw new CircleServiceError(`Unknown user wallet id: ${walletId}`, "WALLET_NOT_FOUND");
  const env = getServerEnv();
  const primaryTokenAddress = isLiveCircleApiKey(env.CIRCLE_API_KEY)
    ? BASE_USDC_CONTRACT_ADDRESS
    : ARC_USDC_CONTRACT_ADDRESS;
  const balanceRequests = [
    client.getWalletTokenBalance({
      id: user.circleWalletId,
      tokenAddresses: [primaryTokenAddress],
    }),
  ];
  if (user.arcMainnetWalletId) {
    balanceRequests.push(
      client.getWalletTokenBalance({
        id: user.arcMainnetWalletId,
        tokenAddresses: [ARC_MAINNET_USDC_CONTRACT_ADDRESS],
      }),
    );
  }
  const responses = await Promise.all(balanceRequests);
  const tokens = responses.flatMap((response) => response.data?.tokenBalances ?? []);
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
    if (
      blockchain === DCW_BLOCKCHAIN_ARC_MAINNET &&
      address === ARC_MAINNET_USDC_CONTRACT_ADDRESS.toLowerCase()
    ) {
      byChain.set(ARC_MAINNET_NETWORK.id, (byChain.get(ARC_MAINNET_NETWORK.id) ?? 0) + amount);
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
  if (byChain.has(ARC_MAINNET_NETWORK.id)) {
    const amt = byChain.get(ARC_MAINNET_NETWORK.id)!;
    total += amt;
    breakdown.push({
      chain: UB_CHAIN_ARC_MAINNET,
      chainId: ARC_MAINNET_NETWORK.id,
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

/** Return only the USDC balance on the chain that will execute the payment. */
export function getUsdcBalanceForChain(
  snapshot: UnifiedBalanceSnapshot,
  chainId: SupportedChainId,
): number {
  const entry = snapshot.breakdown.find((balance) => balance.chainId === chainId);
  const amount = Number(entry?.confirmedBalance ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export { CircleServiceError } from "@/services/circle-errors";
import { CircleServiceError } from "@/services/circle-errors";

function parseUsdcAmount(value: string | undefined): number {
  if (!value) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Read per-chain USDC across the user's chain-specific Circle wallet ids.
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

async function ensureArcMainnetWalletId(
  clerkId: string,
  address: string,
  client: ReturnType<typeof getDcwClient>,
  env: ReturnType<typeof getServerEnv>,
): Promise<string> {
  const existing = await findCircleWalletIdForClerkBlockchain(
    client,
    env.CIRCLE_WALLET_SET_ID,
    clerkId,
    DCW_BLOCKCHAIN_ARC_MAINNET,
  );
  if (existing) {
    if (existing.address.toLowerCase() !== address.toLowerCase()) {
      throw new CircleServiceError(
        "Circle Arc Mainnet wallet address does not match the user's EVM wallet address.",
        "WALLET_NOT_FOUND",
      );
    }
    return existing.id;
  }

  const created = await client.createWallets({
    accountType: "EOA",
    blockchains: [DCW_BLOCKCHAIN_ARC_MAINNET as never],
    count: 1,
    walletSetId: env.CIRCLE_WALLET_SET_ID,
    idempotencyKey: randomUUID(),
    metadata: [{ name: "bookanai-user-arc-mainnet", refId: clerkId }],
  });
  const arcWallet = created.data?.wallets?.find(
    (wallet) => wallet.blockchain === DCW_BLOCKCHAIN_ARC_MAINNET,
  ) ?? created.data?.wallets?.[0];
  if (
    !arcWallet?.id ||
    !arcWallet.address ||
    arcWallet.address.toLowerCase() !== address.toLowerCase()
  ) {
    throw new CircleServiceError(
      "Circle could not provision this user's Arc Mainnet wallet. Verify the LIVE API key and wallet set.",
      "UNSUPPORTED_CHAIN",
    );
  }
  return arcWallet.id;
}

/**
 * Creates (or returns) the user's Circle EOA wallets for the active API-key environment.
 */
export async function createUserEmbeddedWallet(userId: string): Promise<EmbeddedWalletInfo> {
  const existing = userStore.getByUserId(userId);
  if (existing) {
    const env = getServerEnv();
    let arcMainnetWalletId = existing.arcMainnetWalletId;
    if (isLiveCircleApiKey(env.CIRCLE_API_KEY) && !arcMainnetWalletId) {
      arcMainnetWalletId = await ensureArcMainnetWalletId(
        userId,
        existing.address,
        getDcwClient(),
        env,
      );
      userStore.upsertFromClerk({
        clerkId: userId,
        circleWalletId: existing.circleWalletId,
        arcMainnetWalletId,
        address: existing.address,
        ledgerBalance: existing.ledgerBalance,
      });
    }
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
    const arcMainnetWalletId = isLiveCircleApiKey(env.CIRCLE_API_KEY)
      ? reused.arcMainnetWalletId ??
        (await ensureArcMainnetWalletId(userId, reused.address, client, env))
      : null;
    userStore.upsertFromClerk({
      clerkId: userId,
      circleWalletId: reused.id,
      arcMainnetWalletId,
      address: reused.address,
      ledgerBalance: reused.usdcBalance,
    });
    const unified = await getUnifiedBalance(reused.id);
    const { getOnchainSettlementHoldUsdc } = await import(
      "@/server/services/onchain-settlement"
    );
    const hold = getOnchainSettlementHoldUsdc(userId);
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

  const wallets = walletsResponse.data?.wallets ?? [];
  const wallet = wallets.find((item) => item.blockchain === DCW_BLOCKCHAIN_BASE) ?? wallets[0];
  const arcMainnetWallet = wallets.find(
    (item) => item.blockchain === DCW_BLOCKCHAIN_ARC_MAINNET,
  );
  if (!wallet?.id || !wallet.address) {
    throw new CircleServiceError(
      "Circle did not return a wallet for embedded user",
      "SETTLEMENT_FAILED",
    );
  }

  let arcMainnetWalletId = arcMainnetWallet?.id ?? null;
  if (isLiveCircleApiKey(env.CIRCLE_API_KEY) && !arcMainnetWalletId) {
    arcMainnetWalletId = await ensureArcMainnetWalletId(userId, wallet.address, client, env);
  }
  userStore.upsertFromClerk({
    clerkId: userId,
    circleWalletId: wallet.id,
    arcMainnetWalletId,
    address: wallet.address,
    ledgerBalance: 0,
  });

  const unified = await getUnifiedBalance(wallet.id);
  const synced = userStore.reconcileDepositsFromOnChain(userId, unified.totalUsdc);

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
  /** x402 provider's settled transaction hash, when returned by its facilitator. */
  providerPaymentTxHash?: string;
  /** Full API body for frontend formatting */
  rawResponse: string;
  generatedContent: string;
  paymentRequiredObserved: boolean;
  /** Circle DCW user→master transfer id when settled on-chain */
  onChainSettlementTxId?: string;
  /** Queued batched settlement id (on-chain transfer runs async) */
  onChainSettlementQueuedId?: string;
  /** Arc v0.7.2 on-chain memo payload (when settled on Arc Testnet). */
  arcOnChainMemo?: import("@/lib/arc-transaction-extensions").ArcNanopaymentMemo;
  /** True when agent accepts eip155:5042002 and is routable via Arc gateway. */
  arcTestnetGateway?: boolean;
};

async function settleWithMasterAgent(
  resourceUrl: string,
  targetChainId: SupportedChainId,
  minUsdc: number,
  payOptions?: X402PayRequestInit,
): Promise<{ status?: number; data?: unknown; providerPaymentTxHash?: string }> {
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
): Promise<{ status?: number; data?: unknown; providerPaymentTxHash?: string }> {
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
