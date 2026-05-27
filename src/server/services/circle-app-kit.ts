import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import {
  type SupportedChainId,
  unifiedBalanceChainForChainId,
  UB_CHAIN_ARC,
  UB_CHAIN_BASE,
} from "@/lib/chains";
import { isLiveCircleApiKey } from "@/lib/circle-dcw-blockchains";
import { getServerEnv, isCircleConfigured } from "@/server/config/env";
import { userStore } from "@/server/storage/user-store";
import {
  ensureClerkUserWalletSynced,
  getUnifiedBalance,
} from "@/services/circleService";
import { CircleServiceError } from "@/services/circle-errors";

export type AppKitChainId = string;

export type AppKitBalancesDto = {
  totalFormatted: string;
  perChain: { chain: string; amount: string }[];
};

let kitSingleton: AppKit | undefined;
let adapterSingleton: ReturnType<typeof createCircleWalletsAdapter> | undefined;

export function isAppKitConfigured(): boolean {
  return isCircleConfigured();
}

export function isAppKitSwapSendEnabled(): boolean {
  const key = process.env.CIRCLE_KIT_KEY?.trim();
  return Boolean(key && key.startsWith("KIT_KEY:"));
}

function getKit(): AppKit {
  if (!kitSingleton) {
    const kitKey = process.env.CIRCLE_KIT_KEY?.trim();
    kitSingleton = kitKey ? new AppKit({ kitKey }) : new AppKit();
  }
  return kitSingleton;
}

function getCircleAdapter() {
  if (!adapterSingleton) {
    const env = getServerEnv();
    adapterSingleton = createCircleWalletsAdapter({
      apiKey: env.CIRCLE_API_KEY,
      entitySecret: env.ENTITY_SECRET,
    });
  }
  return adapterSingleton;
}

export function defaultUnifiedChainForApiKey(apiKey: string): AppKitChainId {
  return isLiveCircleApiKey(apiKey) ? UB_CHAIN_BASE : UB_CHAIN_ARC;
}

export function chainIdToAppKitChain(chainId: number, apiKey: string): AppKitChainId {
  if (chainId === 8453) return UB_CHAIN_BASE;
  if (chainId === 5042002) return UB_CHAIN_ARC;
  return defaultUnifiedChainForApiKey(apiKey);
}

async function requireUserWallet(clerkId: string) {
  await ensureClerkUserWalletSynced(clerkId);
  const row = userStore.requireByClerkId(clerkId);
  return row;
}

function formatKitError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function appKitGetSupportedChains(
  operation: "bridge" | "swap" | "unifiedBalance",
): Promise<string[]> {
  const kit = getKit();
  return kit.getSupportedChains(operation) as string[];
}

export async function appKitGetBalances(clerkId: string): Promise<AppKitBalancesDto> {
  const row = await requireUserWallet(clerkId);
  const adapter = getCircleAdapter();
  const kit = getKit();
  const env = getServerEnv();

  const result = await kit.unifiedBalance.getBalances({
    token: "USDC",
    sources: { adapter, address: row.address },
  });

  const total = result.totalConfirmedBalance ?? "0";
  const perChain: { chain: string; amount: string }[] = [];

  for (const account of result.breakdown ?? []) {
    for (const chainRow of account.breakdown ?? []) {
      perChain.push({
        chain: chainRow.chain,
        amount: chainRow.confirmedBalance ?? "0",
      });
    }
  }

  void env;
  return { totalFormatted: total, perChain };
}

export async function appKitDeposit(params: {
  clerkId: string;
  amount: string;
  chain?: AppKitChainId;
}): Promise<{ state: string; txHash?: string }> {
  const row = await requireUserWallet(params.clerkId);
  const adapter = getCircleAdapter();
  const kit = getKit();
  const env = getServerEnv();
  const chain =
    params.chain ?? defaultUnifiedChainForApiKey(env.CIRCLE_API_KEY);

  try {
    const result = await kit.unifiedBalance.deposit({
      from: { adapter, chain, address: row.address },
      amount: params.amount,
      token: "USDC",
    });
    const { getOnchainSettlementHoldUsdc } = await import(
      "@/server/services/onchain-settlement"
    );
    const hold = getOnchainSettlementHoldUsdc(params.clerkId);
    const unified = await getUnifiedBalance(row.circleWalletId);
    userStore.reconcileDepositsFromOnChain(
      params.clerkId,
      unified.totalUsdc,
      hold,
    );
    const state =
      (result as { state?: string }).state ??
      (result as { status?: string }).status ??
      "submitted";
    const txHash =
      (result as { txHash?: string }).txHash ??
      (result as { transactionHash?: string }).transactionHash;
    return { state, txHash };
  } catch (error) {
    throw new CircleServiceError(
      `App Kit deposit failed: ${formatKitError(error)}`,
      "SETTLEMENT_FAILED",
    );
  }
}

export async function appKitBridge(params: {
  clerkId: string;
  amount: string;
  fromChain: AppKitChainId;
  toChain: AppKitChainId;
}): Promise<{ state: string }> {
  const row = await requireUserWallet(params.clerkId);
  const adapter = getCircleAdapter();
  const kit = getKit();

  try {
    const result = await kit.bridge({
      from: { adapter, chain: params.fromChain, address: row.address },
      to: { adapter, chain: params.toChain, address: row.address },
      amount: params.amount,
    });
    return { state: (result as { state?: string }).state ?? "submitted" };
  } catch (error) {
    throw new CircleServiceError(
      `App Kit bridge failed: ${formatKitError(error)}`,
      "SETTLEMENT_FAILED",
    );
  }
}

/** Withdraw / send USDC to any address via unified balance spend. */
export async function appKitSpend(params: {
  clerkId: string;
  amount: string;
  recipientAddress: string;
  fromChain?: AppKitChainId;
  toChain?: AppKitChainId;
}): Promise<{ state: string }> {
  const row = await requireUserWallet(params.clerkId);
  const adapter = getCircleAdapter();
  const kit = getKit();
  const env = getServerEnv();
  const fromChain =
    params.fromChain ?? defaultUnifiedChainForApiKey(env.CIRCLE_API_KEY);
  const toChain = params.toChain ?? fromChain;

  try {
    const result = await kit.unifiedBalance.spend({
      amount: params.amount,
      token: "USDC",
      from: {
        adapter,
        address: row.address,
        allocations: { amount: params.amount, chain: fromChain },
      },
      to: {
        chain: toChain,
        recipientAddress: params.recipientAddress,
        useForwarder: true,
      },
    });
    return { state: (result as { state?: string }).state ?? "submitted" };
  } catch (error) {
    throw new CircleServiceError(
      `App Kit spend failed: ${formatKitError(error)}`,
      "SETTLEMENT_FAILED",
    );
  }
}

export async function appKitSwap(params: {
  clerkId: string;
  chain: AppKitChainId;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
}): Promise<{ state: string }> {
  if (!isAppKitSwapSendEnabled()) {
    throw new CircleServiceError(
      "Swap requires CIRCLE_KIT_KEY (KIT_KEY:…) in server environment",
      "SETTLEMENT_FAILED",
    );
  }
  const row = await requireUserWallet(params.clerkId);
  const adapter = getCircleAdapter();
  const kit = getKit();

  try {
    const result = await kit.swap({
      from: { adapter, chain: params.chain, address: row.address },
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
    });
    return { state: (result as { state?: string }).state ?? "submitted" };
  } catch (error) {
    throw new CircleServiceError(
      `App Kit swap failed: ${formatKitError(error)}`,
      "SETTLEMENT_FAILED",
    );
  }
}

export function supportedPaymentChains(apiKey: string): {
  chainId: SupportedChainId;
  appKitChain: AppKitChainId;
  label: string;
}[] {
  if (isLiveCircleApiKey(apiKey)) {
    return [{ chainId: 8453, appKitChain: UB_CHAIN_BASE, label: "Base" }];
  }
  return [{ chainId: 5042002, appKitChain: UB_CHAIN_ARC, label: "Arc Testnet" }];
}

export { unifiedBalanceChainForChainId };
