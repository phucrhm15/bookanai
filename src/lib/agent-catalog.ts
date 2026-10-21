export type AgentNetwork = "arc";

export type Agent = {
  id: string;
  name: string;
  handle: string;
  category: string;
  /** The provider supplies the actual price in its live x402 quote. */
  price: number;
  description: string;
  emoji: string;
  accent: "cyan";
  baseUrl: string;
  network: AgentNetwork;
};

/** Single live research service. This is product configuration, not sample data. */
export const AGENTS: Agent[] = [
  {
    id: "arc-research",
    name: "Arc Research",
    handle: "@arc_research",
    category: "AI Search & Research",
    price: 0,
    description:
      "AI web and news research with citations. Provider pricing is read from the live x402 quote on Arc Mainnet.",
    emoji: "🔎",
    accent: "cyan",
    baseUrl: "https://arc.blockrun.ai",
    network: "arc",
  },
];

export {
  ARC_NETWORK,
  ARC_USDC_CONTRACT_ADDRESS,
  BASE_NETWORK,
  BASE_USDC_CONTRACT_ADDRESS,
} from "@/lib/chains";

/** USDC contract shown for Arc wallet balances. */
export const USDC_CONTRACT_ADDRESS = "0x3600000000000000000000000000000000000000";

export function agentRunsOnArcTestnet(_agentId: string): boolean {
  return false;
}

export function agentRunsOnArcMainnet(agentId: string): boolean {
  return agentId === "arc-research";
}

export function agentRunsOnArc(agentId: string): boolean {
  return agentRunsOnArcMainnet(agentId);
}
