/** Base mainnet — Circle unified balance id `Base`, DCW blockchain `BASE` */
export const BASE_CHAIN_ID = 8453 as const;

/** Arc Testnet — Circle unified balance id `Arc_Testnet`, DCW blockchain `ARC-TESTNET` */
export const ARC_CHAIN_ID = 5042002 as const;

export const BASE_USDC_CONTRACT_ADDRESS =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export const ARC_USDC_CONTRACT_ADDRESS =
  "0x3600000000000000000000000000000000000000" as const;

export const BASE_NETWORK = {
  name: "Base",
  id: BASE_CHAIN_ID,
  usdcContractAddress: BASE_USDC_CONTRACT_ADDRESS,
  depositWarning:
    "Only send native USDC on Base mainnet. Other tokens or networks will result in permanent loss of funds.",
} as const;

export const ARC_NETWORK = {
  name: "Arc Testnet",
  id: ARC_CHAIN_ID,
  usdcContractAddress: ARC_USDC_CONTRACT_ADDRESS,
  depositWarning:
    "Only send USDC on Arc Testnet using the contract address below. Other tokens or networks will result in permanent loss of funds.",
} as const;

export const DCW_BLOCKCHAIN_BASE = "BASE" as const;
export const DCW_BLOCKCHAIN_ARC = "ARC-TESTNET" as const;

export const UB_CHAIN_BASE = "Base" as const;
export const UB_CHAIN_ARC = "Arc_Testnet" as const;

export type SupportedChainId = typeof BASE_CHAIN_ID | typeof ARC_CHAIN_ID;

export function isSupportedChainId(chainId: number): chainId is SupportedChainId {
  return chainId === BASE_CHAIN_ID || chainId === ARC_CHAIN_ID;
}

export function dcwBlockchainForChainId(chainId: SupportedChainId): string {
  return chainId === BASE_CHAIN_ID ? DCW_BLOCKCHAIN_BASE : DCW_BLOCKCHAIN_ARC;
}

export function unifiedBalanceChainForChainId(chainId: SupportedChainId): string {
  return chainId === BASE_CHAIN_ID ? UB_CHAIN_BASE : UB_CHAIN_ARC;
}

export function gatewayChainKeyForChainId(
  chainId: SupportedChainId,
): "base" | "arcTestnet" {
  return chainId === BASE_CHAIN_ID ? "base" : "arcTestnet";
}

export function defaultChainIdForAgentNetwork(network?: string): SupportedChainId {
  const n = (network ?? "").toLowerCase();
  if (n.includes("base")) return BASE_CHAIN_ID;
  return ARC_CHAIN_ID;
}
