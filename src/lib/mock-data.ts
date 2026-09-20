export type AgentNetwork = "base" | "arc-testnet" | "arc";

export type Agent = {
  id: string;
  name: string;
  handle: string;
  category: string;
  price: number; // USDC per request (display hint; charged price comes from x402 probe)
  description: string;
  emoji: string;
  accent: "cyan" | "magenta" | "lime";
  /** x402 marketplace base URL */
  baseUrl: string;
  /** Settlement / UX network badge */
  network: AgentNetwork;
};

export const AGENTS: Agent[] = [
  {
    id: "perplexity-social",
    name: "Web Search Writer",
    handle: "@exa_search",
    category: "Search & News",
    price: 0.007,
    description:
      "Web search theo prompt qua Exa (~0.007 USDC/call). Tìm tin, dự án, token — prompt tiếng Việt/Anh.",
    emoji: "🌍",
    accent: "magenta",
    baseUrl: "https://api.exa.ai",
    network: "base",
  },
  {
    id: "surf-news",
    name: "Polymarket Pulse",
    handle: "@polymarket_pulse",
    category: "Prediction Markets",
    price: 0.001,
    description:
      "Live crypto prediction market odds from Polymarket via nano.blockrun.ai (~0.001 USDC/call). Crypto up/down market sentiment.",
    emoji: "📊",
    accent: "cyan",
    baseUrl: "https://nano.blockrun.ai",
    network: "base",
  },
  {
    id: "crypto-research-b",
    name: "Crypto Research Stack B",
    handle: "@stack_b",
    category: "Research Stack",
    price: 0.11,
    description:
      "Alt-only research (~0.11 USDC): Exa + vaults.fyi + Gloria ticker news ×3. Hard-excludes BTC, ETH, BNB, XRP & stables.",
    emoji: "🔬",
    accent: "lime",
    baseUrl: "https://agents.circle.com/services",
    network: "base",
  },
  {
    id: "arc-market-pulse",
    name: "Arc Market Pulse",
    handle: "@arc_pulse",
    category: "Arc Testnet",
    price: 0.008,
    description:
      "Trending crypto categories via x402 — settled for Arc Testnet (USDC gas, no ETH). ~0.008 USDC/run.",
    emoji: "🌀",
    accent: "cyan",
    baseUrl: "https://api.aisa.one",
    network: "arc-testnet",
  },
  {
    id: "arc-sonar-brief",
    name: "Arc Sonar Brief",
    handle: "@arc_sonar",
    category: "Arc Testnet",
    price: 0.008,
    description:
      "Research brief via Perplexity Sonar x402 — prompts about Arc / USDC-native gas. Arc Testnet settlement path.",
    emoji: "📡",
    accent: "lime",
    baseUrl: "https://api.aisa.one",
    network: "arc-testnet",
  },
  // ── Arc Mainnet agents ─────────────────────────────────────────
  {
    id: "arc-defi-oracle",
    name: "Arc DeFi Oracle",
    handle: "@arc_defi",
    category: "Arc Mainnet",
    price: 0.012,
    description:
      "Live DeFi protocol data on Arc Mainnet — TVL, yields, swap routes via x402. USDC is native gas; no ETH needed. ~0.012 USDC/run.",
    emoji: "⚡",
    accent: "lime",
    baseUrl: "https://api.aisa.one",
    network: "arc",
  },
  {
    id: "arc-mainnet-pulse",
    name: "Arc Mainnet Pulse",
    handle: "@arc_main_pulse",
    category: "Arc Mainnet",
    price: 0.015,
    description:
      "Live on-chain metrics for Arc Mainnet: USDC flows, transaction volume, top contracts. Real-time via x402. ~0.015 USDC/run.",
    emoji: "🔥",
    accent: "cyan",
    baseUrl: "https://api.aisa.one",
    network: "arc",
  },
  {
    id: "arc-chain-analytics",
    name: "Arc Chain Analytics",
    handle: "@arc_analytics",
    category: "Arc Mainnet",
    price: 0.02,
    description:
      "CCTP bridge volume, wallet flows, contract activity on Arc Mainnet. Deep-dive onchain analytics via x402. ~0.02 USDC/run.",
    emoji: "📊",
    accent: "magenta",
    baseUrl: "https://api.aisa.one",
    network: "arc",
  },
];

export type Transaction = {
  id: string;
  label: string;
  amount: number; // negative = spent, positive = received
  agent?: string;
  timestamp: string;
  kind?: "nanopayment" | "deposit" | "withdraw" | "refund";
};

export const TRANSACTIONS: Transaction[] = [
  {
    id: "t1",
    label: "Surf Crypto News · Nanopayment",
    amount: -0.001,
    agent: "Surf Crypto News",
    timestamp: "2m ago",
    kind: "nanopayment",
  },
  {
    id: "t2",
    label: "Web Search Writer · Nanopayment",
    amount: -0.007,
    agent: "Web Search Writer",
    timestamp: "14m ago",
    kind: "nanopayment",
  },
  {
    id: "t3",
    label: "Arc Market Pulse · Nanopayment",
    amount: -0.008,
    agent: "Arc Market Pulse",
    timestamp: "20m ago",
    kind: "nanopayment",
  },
  { id: "t4", label: "Deposit via Circle", amount: 10.0, timestamp: "1h ago", kind: "deposit" },
  {
    id: "t5",
    label: "Hoàn tiền · x402 perplexity-social thất bại",
    amount: 0.007,
    timestamp: "3h ago",
    kind: "refund",
  },
];

export {
  ARC_NETWORK,
  ARC_USDC_CONTRACT_ADDRESS,
  BASE_NETWORK,
  BASE_USDC_CONTRACT_ADDRESS,
} from "@/lib/chains";

/** Arc Testnet native USDC — primary display contract in wallet UI */
export const USDC_CONTRACT_ADDRESS = "0x3600000000000000000000000000000000000000";

export const AGENT_SERVICES_COUNT = AGENTS.length;

export function agentRunsOnArcTestnet(agentId: string): boolean {
  return AGENTS.find((a) => a.id === agentId)?.network === "arc-testnet";
}

export function agentRunsOnArcMainnet(agentId: string): boolean {
  return AGENTS.find((a) => a.id === agentId)?.network === "arc";
}

export function agentRunsOnArc(agentId: string): boolean {
  const n = AGENTS.find((a) => a.id === agentId)?.network;
  return n === "arc-testnet" || n === "arc";
}
