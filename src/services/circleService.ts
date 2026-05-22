import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { AGENTS } from "@/lib/mock-data";
import {
  ARC_USDC_CONTRACT_ADDRESS,
  BASE_USDC_CONTRACT_ADDRESS,
  ARC_NETWORK,
  BASE_NETWORK,
  DCW_BLOCKCHAIN_ARC,
  DCW_BLOCKCHAIN_BASE,
  UB_CHAIN_ARC,
  UB_CHAIN_BASE,
  gatewayChainKeyForChainId,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/chains";
import { getServerEnv, isCircleConfigured } from "@/server/config/env";
import { userStore } from "@/server/storage/user-store";
import { resolveAgentServiceUrl } from "@/services/agent-service-map";
import type { ChainBalanceBreakdown, UnifiedBalanceSnapshot } from "@/lib/wallet-types";

export type { ChainBalanceBreakdown, UnifiedBalanceSnapshot } from "@/lib/wallet-types";

const USER_WALLET_BLOCKCHAINS = [DCW_BLOCKCHAIN_BASE, DCW_BLOCKCHAIN_ARC] as const;

const PAYMENT_FETCH_TIMEOUT_MS = 30_000;
const PAYMENT_MAX_RETRIES = 2;

let dcwClient: ReturnType<typeof initiateDeveloperControlledWalletsClient> | undefined;
const gatewayClients = new Map<SupportedChainId, unknown>();

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

function ledgerFallback(userId: string): UnifiedBalanceSnapshot {
  const user = userStore.getByUserId(userId);
  const amount = user?.ledgerBalance ?? 0;
  return {
    totalUsdc: amount,
    totalConfirmedBalance: String(amount),
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

export class CircleServiceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_CONFIGURED"
      | "WALLET_NOT_FOUND"
      | "INSUFFICIENT_BALANCE"
      | "UNSUPPORTED_CHAIN"
      | "PAYMENT_REQUIRED"
      | "NETWORK_ERROR"
      | "SETTLEMENT_FAILED" = "SETTLEMENT_FAILED",
  ) {
    super(message);
    this.name = "CircleServiceError";
  }
}

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
    return ledgerFallback(user.userId);
  }
}

/**
 * Creates (or returns) a per-user EOA on Base + Arc Testnet — one address on both chains.
 */
export async function createUserEmbeddedWallet(userId: string): Promise<EmbeddedWalletInfo> {
  const existing = userStore.getByUserId(userId);
  if (existing) {
    const unified = await getUnifiedBalance(existing.circleWalletId);
    userStore.syncLedgerFromUnified(userId, unified.totalUsdc);
    return buildWalletInfo(existing, unified);
  }

  const env = getServerEnv();
  const client = getDcwClient();

  const walletsResponse = await client.createWallets({
    accountType: "EOA",
    blockchains: [...USER_WALLET_BLOCKCHAINS],
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

  const record = userStore.createPlaceholder(userId, wallet.id, wallet.address);
  let unified: UnifiedBalanceSnapshot;
  try {
    unified = await getUnifiedBalance(record.circleWalletId);
    userStore.syncLedgerFromUnified(userId, unified.totalUsdc);
  } catch {
    unified = {
      totalUsdc: record.ledgerBalance,
      totalConfirmedBalance: String(record.ledgerBalance),
      breakdown: [],
    };
  }

  return buildWalletInfo(record, unified);
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
  paymentRequiredObserved: boolean;
};

type PaymentRequiredProbe = {
  status: number;
  paymentRequired: boolean;
  hint?: string;
};

async function probePaymentRequired(resourceUrl: string): Promise<PaymentRequiredProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAYMENT_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(resourceUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    return {
      status: res.status,
      paymentRequired: res.status === 402,
      hint: res.status === 402 ? "HTTP 402 Payment Required" : undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CircleServiceError(
        `Marketplace probe timed out after ${PAYMENT_FETCH_TIMEOUT_MS}ms`,
        "NETWORK_ERROR",
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new CircleServiceError(
      `Network error while probing x402 resource: ${message}`,
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function getMasterGatewayClient(chainId: SupportedChainId) {
  if (gatewayClients.has(chainId)) {
    return gatewayClients.get(chainId) as {
      pay: (url: string) => Promise<{ status?: number; data?: unknown }>;
    };
  }

  const env = getServerEnv();
  const { GatewayClient } = await import("@circle-fin/x402-batching/client");
  const client = new GatewayClient({
    chain: gatewayChainKeyForChainId(chainId),
    privateKey: env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`,
  });
  gatewayClients.set(chainId, client);
  return client;
}

async function settleWithMasterAgent(
  resourceUrl: string,
  targetChainId: SupportedChainId,
): Promise<{ status?: number; data?: unknown }> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= PAYMENT_MAX_RETRIES; attempt++) {
    try {
      const gateway = await getMasterGatewayClient(targetChainId);
      return await gateway.pay(resourceUrl);
    } catch (error) {
      lastError = error;
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

/**
 * Simulates x402 (402 probe), verifies unified balance, settles on target chain via master Gateway, debits user ledger.
 */
export async function handleNanopaymentX402(
  userWalletId: string,
  agentServiceId: string,
  targetChainId: number,
): Promise<NanopaymentResult> {
  if (!isSupportedChainId(targetChainId)) {
    throw new CircleServiceError(
      `Unsupported targetChainId ${targetChainId}. Use ${BASE_NETWORK.id} (Base) or ${ARC_NETWORK.id} (Arc Testnet).`,
      "UNSUPPORTED_CHAIN",
    );
  }

  const user = userStore.getByWalletId(userWalletId);
  if (!user) {
    throw new CircleServiceError(`Unknown user wallet id: ${userWalletId}`, "WALLET_NOT_FOUND");
  }

  const agent = AGENTS.find((a) => a.id === agentServiceId);
  if (!agent) {
    throw new CircleServiceError(`Unknown agent service id: ${agentServiceId}`, "SETTLEMENT_FAILED");
  }

  const unified = await getUnifiedBalance(userWalletId);
  if (unified.totalUsdc < agent.price) {
    throw new CircleServiceError(
      `Insufficient unified balance: need ${agent.price} USDC, have ${unified.totalUsdc} USDC`,
      "INSUFFICIENT_BALANCE",
    );
  }

  const resourceUrl = await resolveAgentServiceUrl(agentServiceId);

  let probe: PaymentRequiredProbe;
  try {
    probe = await probePaymentRequired(resourceUrl);
  } catch (error) {
    if (error instanceof CircleServiceError) throw error;
    throw error;
  }

  if (!probe.paymentRequired && probe.status !== 200) {
    console.warn(
      `[x402] Expected 402 from ${resourceUrl}, got ${probe.status}; continuing with master settlement`,
    );
  }

  const response = await settleWithMasterAgent(resourceUrl, targetChainId);
  const bodyText =
    typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data ?? {});

  const updated = userStore.debit(user.userId, agent.price, {
    label: `${agent.name} · Nanopayment`,
    agentId: agentServiceId,
  });

  const refreshed = await getUnifiedBalance(userWalletId).catch(() => unified);
  userStore.syncLedgerFromUnified(user.userId, refreshed.totalUsdc);

  return {
    agentServiceId,
    resourceUrl,
    targetChainId,
    chargedUsdc: agent.price,
    ledgerBalance: updated.ledgerBalance,
    unifiedBalance: refreshed.totalUsdc,
    responseStatus: response.status ?? 200,
    responsePreview: bodyText.slice(0, 500),
    paymentRequiredObserved: probe.paymentRequired,
  };
}

export function circleRuntimeReady(): boolean {
  return isCircleConfigured();
}

export { BASE_USDC_CONTRACT_ADDRESS, ARC_USDC_CONTRACT_ADDRESS, BASE_NETWORK, ARC_NETWORK };
