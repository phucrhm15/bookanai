import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import {
  ARC_CHAIN_ID,
  BASE_CHAIN_ID,
  DCW_BLOCKCHAIN_ARC,
  DCW_BLOCKCHAIN_BASE,
} from "@/lib/chains";

type MasterDcwClient = ReturnType<typeof initiateDeveloperControlledWalletsClient>;

export const MASTER_BASE_CHAIN_ID = BASE_CHAIN_ID;
export const MASTER_ARC_CHAIN_ID = ARC_CHAIN_ID;

export const MASTER_ARC_BLOCKCHAIN = DCW_BLOCKCHAIN_ARC;
export const MASTER_BASE_BLOCKCHAIN = DCW_BLOCKCHAIN_BASE;

const MASTER_WALLET_BLOCKCHAINS = [DCW_BLOCKCHAIN_BASE, DCW_BLOCKCHAIN_ARC] as const;

/** Native USDC on Arc Testnet */
export const MASTER_USDC_CONTRACT_ADDRESS =
  "0x3600000000000000000000000000000000000000" as const;

const MASTER_WALLET_SET_NAME = "bookanai-master-agent";
const MASTER_WALLET_METADATA_NAME = "bookanai-master-system-agent";

export type MasterAgentStatus = {
  configured: boolean;
  walletSetId: string | null;
  walletId: string | null;
  address: string | null;
  blockchains: readonly string[];
  chainIds: readonly number[];
  usdcContractAddress: typeof MASTER_USDC_CONTRACT_ADDRESS;
  usdcBalance: string | null;
};

type MasterAgentCache = {
  walletSetId: string;
  walletId: string;
  address: string;
};

let dcwClient: MasterDcwClient | undefined;
let masterCache: MasterAgentCache | undefined;

/**
 * Lỗi riêng cho luồng ví Master (tách khỏi user embedded wallets).
 */
export class MasterAgentError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_CONFIGURED"
      | "INIT_FAILED"
      | "BALANCE_FAILED"
      | "WALLET_NOT_FOUND" = "INIT_FAILED",
  ) {
    super(message);
    this.name = "MasterAgentError";
  }
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value?.trim() ? value.trim() : undefined;
}

/**
 * True when Circle API credentials for the master agent are present.
 * Optional MASTER_WALLET_SET_ID / MASTER_CIRCLE_WALLET_ID are not required.
 */
export function isMasterAgentConfigured(): boolean {
  return Boolean(readEnv("CIRCLE_API_KEY") && readEnv("ENTITY_SECRET"));
}

function requireMasterCredentials(): { apiKey: string; entitySecret: string } {
  const apiKey = readEnv("CIRCLE_API_KEY");
  const entitySecret = readEnv("ENTITY_SECRET");
  if (!apiKey || !entitySecret) {
    throw new MasterAgentError(
      "CIRCLE_API_KEY and ENTITY_SECRET are required for the master system agent",
      "NOT_CONFIGURED",
    );
  }
  return { apiKey, entitySecret };
}

function getMasterDcwClient(): MasterDcwClient {
  if (!dcwClient) {
    const { apiKey, entitySecret } = requireMasterCredentials();
    dcwClient = initiateDeveloperControlledWalletsClient({
      apiKey,
      entitySecret,
    });
  }
  return dcwClient;
}

/**
 * Maps setup.md Step 4 (wallet set) — createWalletSet when MASTER_WALLET_SET_ID is unset.
 */
async function createMasterWalletSet(
  client: MasterDcwClient,
): Promise<string> {
  const response = await client.createWalletSet({
    name: MASTER_WALLET_SET_NAME,
    idempotencyKey: randomUUID(),
  });

  const walletSetId = response.data?.walletSet?.id;
  if (!walletSetId) {
    throw new MasterAgentError(
      "Circle createWalletSet did not return a wallet set id",
      "INIT_FAILED",
    );
  }
  return walletSetId;
}

/**
 * Maps setup.md Step 4 (create agent wallet) — EOA on ARC-TESTNET, count 1.
 */
async function createMasterEoaWallet(
  client: MasterDcwClient,
  walletSetId: string,
): Promise<MasterAgentCache> {
  const response = await client.createWallets({
    accountType: "EOA",
    blockchains: [...MASTER_WALLET_BLOCKCHAINS],
    count: 1,
    walletSetId,
    idempotencyKey: randomUUID(),
    metadata: [{ name: MASTER_WALLET_METADATA_NAME }],
  });

  const wallet = response.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) {
    throw new MasterAgentError(
      "Circle createWallets did not return a master wallet",
      "INIT_FAILED",
    );
  }

  return {
    walletSetId,
    walletId: wallet.id,
    address: wallet.address,
  };
}

async function resolveMasterWalletFromEnv(
  client: MasterDcwClient,
): Promise<MasterAgentCache> {
  const presetWalletSetId = readEnv("MASTER_WALLET_SET_ID");
  const presetWalletId = readEnv("MASTER_CIRCLE_WALLET_ID");

  if (presetWalletId) {
    const walletResponse = await client.getWallet({ id: presetWalletId });
    const wallet = walletResponse.data?.wallet;
    if (!wallet?.id || !wallet.address) {
      throw new MasterAgentError(
        `Master wallet not found for MASTER_CIRCLE_WALLET_ID=${presetWalletId}`,
        "WALLET_NOT_FOUND",
      );
    }
    return {
      walletSetId: wallet.walletSetId ?? presetWalletSetId ?? "",
      walletId: wallet.id,
      address: wallet.address,
    };
  }

  const walletSetId =
    presetWalletSetId ?? (await createMasterWalletSet(client));
  return createMasterEoaWallet(client, walletSetId);
}

/**
 * Initializes the master system agent wallet (SDK equivalent of setup.md wallet create flow).
 * Persists ids in memory; set MASTER_WALLET_SET_ID and MASTER_CIRCLE_WALLET_ID in env to reuse.
 */
export async function initializeMasterAgentWallet(): Promise<MasterAgentCache> {
  if (masterCache) {
    return masterCache;
  }

  const client = getMasterDcwClient();
  try {
    masterCache = await resolveMasterWalletFromEnv(client);
    return masterCache;
  } catch (error) {
    if (error instanceof MasterAgentError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new MasterAgentError(
      `Failed to initialize master agent wallet: ${message}`,
      "INIT_FAILED",
    );
  }
}

async function getCachedOrInitMaster(): Promise<MasterAgentCache> {
  if (!masterCache) {
    await initializeMasterAgentWallet();
  }
  return masterCache!;
}

/**
 * Maps setup.md Step 5 (balance) — getWalletTokenBalance for USDC on Arc Testnet.
 */
export async function fetchMasterUsdcBalance(): Promise<string> {
  const { walletId } = await getCachedOrInitMaster();
  const client = getMasterDcwClient();

  try {
    const balanceResponse = await client.getWalletTokenBalance({
      id: walletId,
      tokenAddresses: [MASTER_USDC_CONTRACT_ADDRESS],
    });

    const tokenBalances = balanceResponse.data?.tokenBalances ?? [];
    const usdc = tokenBalances.find(
      (t) =>
        t.token?.address?.toLowerCase() ===
        MASTER_USDC_CONTRACT_ADDRESS.toLowerCase(),
    );

    return usdc?.amount ?? "0";
  } catch (error) {
    if (error instanceof MasterAgentError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new MasterAgentError(
      `Failed to fetch master USDC balance: ${message}`,
      "BALANCE_FAILED",
    );
  }
}

/** On-chain address of the master agent EOA (for x402 settlement routing). */
export async function getMasterAgentAddress(): Promise<string> {
  const { address } = await getCachedOrInitMaster();
  return address;
}

/**
 * Snapshot of master agent configuration and balance.
 * Does not throw when credentials are missing; returns configured: false.
 */
export async function getMasterAgentStatus(): Promise<MasterAgentStatus> {
  const base: MasterAgentStatus = {
    configured: isMasterAgentConfigured(),
    walletSetId: readEnv("MASTER_WALLET_SET_ID") ?? masterCache?.walletSetId ?? null,
    walletId: readEnv("MASTER_CIRCLE_WALLET_ID") ?? masterCache?.walletId ?? null,
    address: masterCache?.address ?? null,
    blockchains: [...MASTER_WALLET_BLOCKCHAINS],
    chainIds: [MASTER_BASE_CHAIN_ID, MASTER_ARC_CHAIN_ID],
    usdcContractAddress: MASTER_USDC_CONTRACT_ADDRESS,
    usdcBalance: null,
  };

  if (!base.configured) {
    return base;
  }

  try {
    const cache = await getCachedOrInitMaster();
    base.walletSetId = cache.walletSetId || base.walletSetId;
    base.walletId = cache.walletId;
    base.address = cache.address;
    base.usdcBalance = await fetchMasterUsdcBalance();
  } catch {
    // Status probe should remain non-fatal when balance or init fails
  }

  return base;
}

/** Clears in-memory SDK client and master wallet cache (e.g. after env rotation). */
export function resetMasterAgentCache(): void {
  dcwClient = undefined;
  masterCache = undefined;
}
