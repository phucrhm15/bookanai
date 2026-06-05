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
};

export const AGENTS: Agent[] = [
  {
    id: "messari-analyst",
    name: "Messari Token Analyst",
    handle: "@messari_analyst",
    category: "On-chain Data",
    price: 0.1,
    description:
      "Token price / ATH / volume (BTC, ETH…). ~0.1 USDC/call — not long-form macro news.",
    emoji: "📊",
    accent: "cyan",
    baseUrl: "https://api.messari.io",
  },
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
  },
  {
    id: "surf-news",
    name: "Surf Crypto News",
    handle: "@surf_ai",
    category: "News Feed",
    price: 0.001,
    description:
      "AI-curated crypto news feed from Surf (~0.001 USDC/call). Great for fast market headlines.",
    emoji: "🏄",
    accent: "cyan",
    baseUrl: "https://nano.blockrun.ai",
  },
  {
    id: "surf-tokenomics",
    name: "Surf Tokenomics",
    handle: "@surf_tokenomics",
    category: "Token Research",
    price: 0.0019,
    description:
      "Tokenomics-focused endpoint from Surf (~0.0019 USDC/call): supply, unlock, and structure snapshots.",
    emoji: "🧬",
    accent: "magenta",
    baseUrl: "https://nano.blockrun.ai",
  },
  {
    id: "crypto-research-b",
    name: "Crypto Research Stack B",
    handle: "@stack_b",
    category: "Research Stack",
    price: 0.22,
    description:
      "Alt-only research (~0.22 USDC): Exa + Messari + vaults.fyi + Gloria ×3. Hard-excludes BTC, ETH, BNB, XRP & stables.",
    emoji: "🔬",
    accent: "lime",
    baseUrl: "https://agents.circle.com/services",
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
    label: "Messari Token Analyst · Nanopayment",
    amount: -0.1,
    agent: "Messari Token Analyst",
    timestamp: "2m ago",
    kind: "nanopayment",
  },
  {
    id: "t2",
    label: "Perplexity Search Writer · Nanopayment",
    amount: -0.008,
    agent: "Perplexity Search Writer",
    timestamp: "14m ago",
    kind: "nanopayment",
  },
  { id: "t3", label: "Deposit via Circle", amount: 10.0, timestamp: "1h ago", kind: "deposit" },
  {
    id: "t4",
    label: "Hoàn tiền · x402 perplexity-social thất bại",
    amount: 0.008,
    timestamp: "3h ago",
    kind: "refund",
  },
  { id: "t5", label: "Deposit via Circle", amount: 5.0, timestamp: "2d ago", kind: "deposit" },
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
