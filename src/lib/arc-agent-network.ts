/**
 * Arc Testnet agent network gateway — auto-select payment chain from x402 accepts.
 * Register agent ids in ARC_TESTNET_AGENT_IDS when they list eip155:5042002.
 */
import { ARC_CHAIN_ID, BASE_CHAIN_ID, type SupportedChainId } from "@/lib/chains";
import { defaultPaymentChainId } from "@/lib/circle-dcw-blockchains";
import { priceUsdcFromDiscoveryAccepts } from "@/lib/x402-probe";

export type X402NetworkAccept = {
  scheme?: string;
  network?: string;
  amount?: string;
  maxAmountRequired?: string;
};

/**
 * Agents explicitly routed to Arc Testnet (add ids as Circle Discovery lists them).
 * Empty registry is fine — accepts metadata still drives auto-detection.
 */
export const ARC_TESTNET_AGENT_IDS = new Set<string>([
  // e.g. "my-arc-agent": register here when live on Arc Testnet x402
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

/**
 * Pick the chain for x402 nanopayment.
 * - TEST API key → Arc Testnet when agent accepts it (or is registered).
 * - LIVE API key → Base when agent accepts it; Arc only if explicitly registered.
 */
export function resolveAgentPaymentChain(input: {
  apiKey: string;
  agentServiceId: string;
  accepts?: X402NetworkAccept[];
  requestedChainId?: number;
}): SupportedChainId {
  const { apiKey, agentServiceId, accepts, requestedChainId } = input;
  const envDefault = defaultPaymentChainId(apiKey);
  const live = apiKey.startsWith("LIVE_API_KEY");

  const candidates: SupportedChainId[] = [];
  if (requestedChainId === BASE_CHAIN_ID || requestedChainId === ARC_CHAIN_ID) {
    candidates.push(requestedChainId);
  }
  if (agentPrefersArcTestnet(agentServiceId, accepts)) {
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
    if (live && chainId === ARC_CHAIN_ID && !ARC_TESTNET_AGENT_IDS.has(agentServiceId)) {
      continue;
    }
    if (!accepts?.length) {
      if (chainId === envDefault) return chainId;
      continue;
    }
    const price = priceUsdcFromDiscoveryAccepts(accepts, chainId);
    if (price !== null && price > 0) return chainId;
  }

  return envDefault;
}

export function arcTestnetGatewayReady(agentServiceId: string, accepts?: X402NetworkAccept[]): boolean {
  return agentPrefersArcTestnet(agentServiceId, accepts) && agentAcceptsArcTestnet(accepts);
}
