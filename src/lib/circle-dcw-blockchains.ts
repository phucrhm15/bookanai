import type { Blockchain } from "@circle-fin/developer-controlled-wallets";
import {
  ARC_CHAIN_ID,
  BASE_CHAIN_ID,
  DCW_BLOCKCHAIN_ARC,
  DCW_BLOCKCHAIN_BASE,
  type SupportedChainId,
} from "@/lib/chains";

/**
 * Circle rejects mixing LIVE (mainnet) and TEST (testnet) blockchains per API key.
 * @see error code 156006
 */
export function dcwBlockchainsForApiKey(apiKey: string): Blockchain[] {
  if (apiKey.startsWith("LIVE_API_KEY")) {
    return [DCW_BLOCKCHAIN_BASE];
  }
  if (apiKey.startsWith("TEST_API_KEY")) {
    return [DCW_BLOCKCHAIN_ARC];
  }
  return [DCW_BLOCKCHAIN_BASE, DCW_BLOCKCHAIN_ARC];
}

export function isLiveCircleApiKey(apiKey: string): boolean {
  return apiKey.startsWith("LIVE_API_KEY");
}

/** Chain id used for x402 nanopayments — must match API key environment. */
export function defaultPaymentChainId(apiKey: string): SupportedChainId {
  return isLiveCircleApiKey(apiKey) ? BASE_CHAIN_ID : ARC_CHAIN_ID;
}

export function dcwBlockchainForPaymentChain(chainId: SupportedChainId): Blockchain {
  return chainId === BASE_CHAIN_ID ? DCW_BLOCKCHAIN_BASE : DCW_BLOCKCHAIN_ARC;
}
