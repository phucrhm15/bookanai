export type Agent = {
  id: string;
  name: string;
  handle: string;
  category: string;
  price: number; // USDC per request (display hint; charged price comes from x402 probe)
  description: string;
  emoji: string;
  accent: "cyan" | "magenta";
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
    name: "Perplexity Search Writer",
    handle: "@perplexity_macro",
    category: "Search & News",
    price: 0.008,
    description:
      "Macro & political news, long X threads (~0.01 USDC/call). Prompt in English or Vietnamese.",
    emoji: "🌍",
    accent: "magenta",
    baseUrl: "https://api.aisa.one",
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
