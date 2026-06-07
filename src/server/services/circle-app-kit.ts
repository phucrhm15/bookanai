/**
 * Circle App Kit — loaded via createRequire so Vite SSR does not bundle CJS into ESM
 * (fixes "exports is not defined" on Render).
 */
import { createRequire } from "node:module";
import {
  ARC_CHAIN_ID,
  BASE_CHAIN_ID,
  type SupportedChainId,
  unifiedBalanceChainForChainId,
  UB_CHAIN_ARC,
  UB_CHAIN_BASE,
} from "@/lib/chains";
import {
  chainNeedsEthForGas,
  getEthBalanceOnBase,
  MIN_BASE_ETH_FOR_GAS,
  RECOMMENDED_BASE_ETH,
} from "@/server/services/wallet-gas-check";
import { isLiveCircleApiKey } from "@/lib/circle-dcw-blockchains";
import { getServerEnv, isCircleConfigured } from "@/server/config/env";
import { userStore } from "@/server/storage/user-store";
import {
  ensureClerkUserWalletSynced,
  getUnifiedBalance,
} from "@/services/circleService";
import { CircleServiceError } from "@/services/circle-errors";

const require = createRequire(import.meta.url);

type AppKitChainId = string;

type CircleFinModules = {
  AppKit: new (config?: { kitKey?: string }) => CircleAppKitClient;
  createCircleWalletsAdapter: (opts: {
    apiKey: string;
    entitySecret: string;
  }) => CircleWalletsAdapter;
};

type CircleAppKitClient = {
  unifiedBalance: {
    getBalances: (params: unknown) => Promise<{
      totalConfirmedBalance?: string;
      breakdown?: {
        breakdown?: { chain: string; confirmedBalance?: string }[];
      }[];
    }>;
    deposit: (params: unknown) => Promise<{ state?: string; txHash?: string; transactionHash?: string }>;
    spend: (params: unknown) => Promise<{ state?: string }>;
  };
  bridge: (params: unknown) => Promise<{ state?: string }>;
  swap: (params: unknown) => Promise<{ state?: string }>;
  getSupportedChains: (op: string) => string[];
};

type CircleWalletsAdapter = object;

export type { AppKitChainId };

export type AppKitBalancesDto = {
  totalFormatted: string;
  perChain: { chain: string; amount: string }[];
};

let circleFin: CircleFinModules | undefined;
let kitSingleton: CircleAppKitClient | undefined;
let adapterSingleton: CircleWalletsAdapter | undefined;

function loadCircleFin(): CircleFinModules {
  if (!circleFin) {
    const appKitMod = require("@circle-fin/app-kit") as { AppKit: CircleFinModules["AppKit"] };
    const adapterMod = require("@circle-fin/adapter-circle-wallets") as {
      createCircleWalletsAdapter: CircleFinModules["createCircleWalletsAdapter"];
    };
    circleFin = {
      AppKit: appKitMod.AppKit,
      createCircleWalletsAdapter: adapterMod.createCircleWalletsAdapter,
    };
  }
  return circleFin;
}

export function isAppKitConfigured(): boolean {
  return isCircleConfigured();
}

export function isAppKitSwapSendEnabled(): boolean {
  const key = process.env.CIRCLE_KIT_KEY?.trim();
  return Boolean(key && key.startsWith("KIT_KEY:"));
}

function getKit(): CircleAppKitClient {
  if (!kitSingleton) {
    const { AppKit } = loadCircleFin();
    const kitKey = process.env.CIRCLE_KIT_KEY?.trim();
    kitSingleton = kitKey ? new AppKit({ kitKey }) : new AppKit();
  }
  return kitSingleton;
}

function getCircleAdapter(): CircleWalletsAdapter {
  if (!adapterSingleton) {
    const env = getServerEnv();
    const { createCircleWalletsAdapter } = loadCircleFin();
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
  return userStore.requireByClerkId(clerkId);
}

function formatKitError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isGasErrorMessage(message: string): boolean {
  return /Insufficient ETH|insufficient funds for gas|gas fees|max fee per gas/i.test(
    message,
  );
}

function toCircleKitError(error: unknown, prefix: string): CircleServiceError {
  const detail = formatKitError(error);
  const message = `${prefix}: ${detail}`;
  if (isGasErrorMessage(detail)) {
    return new CircleServiceError(message, "NEEDS_ETH_GAS");
  }
  return new CircleServiceError(message, "SETTLEMENT_FAILED");
}

export type AppKitFundingStatus = {
  address: string;
  ethOnBase: number;
  ethSufficient: boolean;
  recommendedEth: number;
  usdcOnBase: number;
  usdcOnArc: number;
};

export async function appKitGetFundingStatus(clerkId: string): Promise<AppKitFundingStatus> {
  const row = await requireUserWallet(clerkId);
  const unified = await getUnifiedBalance(row.circleWalletId);
  const ethOnBase = await getEthBalanceOnBase(row.address as `0x${string}`);
  const usdcOnBase = Number(
    unified.breakdown.find((b) => b.chainId === BASE_CHAIN_ID)?.confirmedBalance ?? 0,
  );
  const usdcOnArc = Number(
    unified.breakdown.find((b) => b.chainId === ARC_CHAIN_ID)?.confirmedBalance ?? 0,
  );
  return {
    address: row.address,
    ethOnBase,
    ethSufficient: ethOnBase >= MIN_BASE_ETH_FOR_GAS,
    recommendedEth: RECOMMENDED_BASE_ETH,
    usdcOnBase,
    usdcOnArc,
  };
}

async function assertOnChainPreflight(params: {
  chain: AppKitChainId;
  address: string;
  circleWalletId: string;
  amountUsdc: number;
}): Promise<void> {
  const unified = await getUnifiedBalance(params.circleWalletId);
  const onChainForChain =
    params.chain === UB_CHAIN_BASE
      ? Number(
          unified.breakdown.find((b) => b.chainId === BASE_CHAIN_ID)?.confirmedBalance ?? 0,
        )
      : params.chain === UB_CHAIN_ARC
        ? Number(
            unified.breakdown.find((b) => b.chainId === ARC_CHAIN_ID)?.confirmedBalance ?? 0,
          )
        : unified.totalUsdc;

  if (params.amountUsdc > onChainForChain + 0.000_001) {
    throw new CircleServiceError(
      `Insufficient USDC on ${params.chain}: need ${params.amountUsdc}, wallet has ${onChainForChain.toFixed(6)} on-chain.`,
      "INSUFFICIENT_BALANCE",
    );
  }

  if (chainNeedsEthForGas(params.chain)) {
    const eth = await getEthBalanceOnBase(params.address as `0x${string}`);
    if (eth < MIN_BASE_ETH_FOR_GAS) {
      throw new CircleServiceError(
        `Your embedded wallet needs ETH on Base for gas (~${RECOMMENDED_BASE_ETH} ETH recommended). ` +
          `Send ETH to ${params.address} on Base mainnet. Current: ${eth.toFixed(6)} ETH.`,
        "NEEDS_ETH_GAS",
      );
    }
  }
}

export async function appKitGetSupportedChains(
  operation: "bridge" | "swap" | "unifiedBalance",
): Promise<string[]> {
  return getKit().getSupportedChains(operation);
}

export async function appKitGetBalances(clerkId: string): Promise<AppKitBalancesDto> {
  const row = await requireUserWallet(clerkId);
  const adapter = getCircleAdapter();
  const kit = getKit();

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
  const amountUsdc = Number(params.amount);
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new CircleServiceError("Invalid deposit amount", "SETTLEMENT_FAILED");
  }

  await assertOnChainPreflight({
    chain,
    address: row.address,
    circleWalletId: row.circleWalletId,
    amountUsdc,
  });

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
    return {
      state: result.state ?? "submitted",
      txHash: result.txHash ?? result.transactionHash,
    };
  } catch (error) {
    throw toCircleKitError(error, "App Kit deposit failed");
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
  const amountUsdc = Number(params.amount);
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new CircleServiceError("Invalid bridge amount", "SETTLEMENT_FAILED");
  }

  await assertOnChainPreflight({
    chain: params.fromChain,
    address: row.address,
    circleWalletId: row.circleWalletId,
    amountUsdc,
  });

  try {
    const result = await kit.bridge({
      from: { adapter, chain: params.fromChain, address: row.address },
      to: { adapter, chain: params.toChain, address: row.address },
      amount: params.amount,
    });
    return { state: result.state ?? "submitted" };
  } catch (error) {
    throw toCircleKitError(error, "App Kit bridge failed");
  }
}

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
    return { state: result.state ?? "submitted" };
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
    return { state: result.state ?? "submitted" };
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
    return [
      { chainId: 8453, appKitChain: UB_CHAIN_BASE, label: "Base" },
      { chainId: 5042002, appKitChain: UB_CHAIN_ARC, label: "Arc Testnet" },
    ];
  }
  return [{ chainId: 5042002, appKitChain: UB_CHAIN_ARC, label: "Arc Testnet" }];
}

export { unifiedBalanceChainForChainId };
