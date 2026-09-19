/**
 * Arc Testnet agent network gateway — auto-select payment chain from x402 accepts.
 * Register agent ids in ARC_TESTNET_AGENT_IDS for Arc-branded Studio agents.
 */
import { ARC_CHAIN_ID, ARC_MAINNET_CHAIN_ID, BASE_CHAIN_ID, type SupportedChainId } from "@/lib/chains";
import { defaultPaymentChainId, isLiveCircleApiKey } from "@/lib/circle-dcw-blockchains";
import { priceUsdcFromDiscoveryAccepts } from "@/lib/x402-probe";

export type X402NetworkAccept = {
  scheme?: string;
  network?: string;
  amount?: string;
  maxAmountRequired?: string;
};

/**
 * Agents explicitly routed to Arc Testnet UX / settlement preference.
 * LIVE Circle API keys cannot create Arc DCW wallets — settlement falls back to Base.
 */
export const ARC_TESTNET_AGENT_IDS = new Set<string>([
  "arc-market-pulse",
  "arc-sonar-brief",
]);

/**
 * Agents running on Arc Mainnet (real USDC, chain ID 5042).
 */
export const ARC_MAINNET_AGENT_IDS = new Set<string>([
  "arc-defi-oracle",
  "arc-mainnet-pulse",
  "arc-chain-analytics",
]);

export function agentAcceptsArcTestnet(accepts?: X402NetworkAccept[]): boolean {
  if (!accepts?.length) return false;
  const arcNetwork = `eip155:${ARC_CHAIN_ID}`;
  return accepts.some(
    (a) => a.network === arcNetwork || a.network?.includes(String(ARC_CHAIN_ID)),
  );
}

export function agentAcceptsBase(accepts?: X402NetworkAccept[]): boolean {
  if (!accepts?.length) return false;
  const baseNetwork = `eip155:${BASE_CHAIN_ID}`;
  return accepts.some(
    (a) => a.network === baseNetwork || a.network?.includes(String(BASE_CHAIN_ID)),
  );
}

export function agentPrefersArcTestnet(
  agentServiceId: string,
  accepts?: X402NetworkAccept[],
): boolean {
  if (ARC_TESTNET_AGENT_IDS.has(agentServiceId)) return true;
  return agentAcceptsArcTestnet(accepts);
}

export function agentPrefersArcMainnet(agentServiceId: string): boolean {
  return ARC_MAINNET_AGENT_IDS.has(agentServiceId);
}

/**
 * Pick the chain for x402 nanopayment / user→master settlement.
 * - TEST API key → Arc Testnet for Arc agents (and when Discovery lists eip155:5042002).
 * - LIVE API key → Base only (Circle DCW cannot mix LIVE + ARC-TESTNET).
 */
export function resolveAgentPaymentChain(input: {
  apiKey: string;
  agentServiceId: string;
  accepts?: X402NetworkAccept[];
  requestedChainId?: number;
}): SupportedChainId {
  const { apiKey, agentServiceId, accepts, requestedChainId } = input;
  const envDefault = defaultPaymentChainId(apiKey);
  const live = isLiveCircleApiKey(apiKey);
  const prefersArc = agentPrefersArcTestnet(agentServiceId, accepts);

  // Arc Mainnet agents always use Arc Mainnet regardless of API key type.
  if (agentPrefersArcMainnet(agentServiceId)) {
    return ARC_MAINNET_CHAIN_ID;
  }

  // LIVE keys: Circle rejects ARC-TESTNET wallets → always settle on Base.
  if (live) {
    if (requestedChainId === BASE_CHAIN_ID) return BASE_CHAIN_ID;
    return BASE_CHAIN_ID;
  }

  // TEST keys: Arc-registered agents default to Arc Testnet.
  if (prefersArc) {
    return ARC_CHAIN_ID;
  }

  const candidates: SupportedChainId[] = [];
  if (requestedChainId === BASE_CHAIN_ID || requestedChainId === ARC_CHAIN_ID) {
    candidates.push(requestedChainId);
  }
  if (agentAcceptsArcTestnet(accepts)) {
    candidates.push(ARC_CHAIN_ID);
  }
  if (agentAcceptsBase(accepts)) {
    candidates.push(BASE_CHAIN_ID);
  }
  candidates.push(envDefault);

  const seen = new Set<number>();
  for (const chainId of candidates) {
    if (seen.has(chainId)) continue;
    seen.add(chainId);
    if (!accepts?.length) {
      if (chainId === envDefault) return chainId;
      continue;
    }
    const price = priceUsdcFromDiscoveryAccepts(accepts, chainId);
    if (price !== null && price > 0) return chainId;
  }

  return envDefault;
}

export function arcTestnetGatewayReady(
  agentServiceId: string,
  accepts?: X402NetworkAccept[],
): boolean {
  return agentPrefersArcTestnet(agentServiceId, accepts) && agentAcceptsArcTestnet(accepts);
}
