export type Agent = {
  id: string;
  name: string;
  handle: string;
  category: string;
  price: number; // USDC per request
  description: string;
  emoji: string;
  accent: "cyan" | "magenta" | "lime" | "amber" | "violet";
};

export const AGENTS: Agent[] = [
  {
    id: "alpha-caller-x",
    name: "Alpha Caller X",
    handle: "@alpha_caller",
    category: "Trading Signals",
    price: 0.01,
    description: "Surfaces narrative-driven alpha threads before they trend.",
    emoji: "◈",
    accent: "cyan",
  },
  {
    id: "meme-image-gen",
    name: "Meme Image Generator",
    handle: "@meme_factory",
    category: "Image",
    price: 0.02,
    description: "On-chain meme lord. Generates viral imagery for any ticker.",
    emoji: "✦",
    accent: "magenta",
  },
  {
    id: "rwa-thread-writer",
    name: "RWA Thread Writer",
    handle: "@rwa_writes",
    category: "Long-form",
    price: 0.008,
    description: "Tokenization deep-dives, regulator-friendly tone.",
    emoji: "⬢",
    accent: "lime",
  },
  {
    id: "crypto-writer",
    name: "Crypto Writer",
    handle: "@chain_scribe",
    category: "News Recap",
    price: 0.01,
    description: "Daily market & protocol recaps in your voice.",
    emoji: "◊",
    accent: "amber",
  },
  {
    id: "shitpost-9000",
    name: "Shitpost 9000",
    handle: "@shitpost9k",
    category: "Engagement",
    price: 0.005,
    description: "Replies, ratios, and degen wisdom on autopilot.",
    emoji: "⌬",
    accent: "violet",
  },
  {
    id: "sentiment-scanner",
    name: "Sentiment Scanner",
    handle: "@mood_oracle",
    category: "Analytics",
    price: 0.012,
    description: "Reads the timeline's mood and turns it into postable insight.",
    emoji: "◉",
    accent: "cyan",
  },
];

export type Transaction = {
  id: string;
  label: string;
  amount: number; // negative = spent, positive = received
  agent?: string;
  timestamp: string;
  kind?: "nanopayment" | "deposit" | "withdraw";
};

export const TRANSACTIONS: Transaction[] = [
  { id: "t1", label: "Crypto Writer · Nanopayment", amount: -0.01, agent: "Crypto Writer", timestamp: "2m ago", kind: "nanopayment" },
  { id: "t2", label: "Meme Image Generator · Nanopayment", amount: -0.02, agent: "Meme Generator", timestamp: "14m ago", kind: "nanopayment" },
  { id: "t3", label: "Shitpost 9000 · Nanopayment", amount: -0.005, agent: "Shitpost 9000", timestamp: "22m ago", kind: "nanopayment" },
  { id: "t4", label: "Deposit via Circle", amount: 10.0, timestamp: "1h ago", kind: "deposit" },
  { id: "t5", label: "Alpha Caller X · Nanopayment", amount: -0.01, agent: "Alpha Caller X", timestamp: "3h ago", kind: "nanopayment" },
  { id: "t6", label: "RWA Thread Writer · Nanopayment", amount: -0.008, agent: "RWA Writer", timestamp: "yesterday", kind: "nanopayment" },
  { id: "t7", label: "Deposit via Circle", amount: 5.0, timestamp: "2d ago", kind: "deposit" },
];

export const MOCK_WALLET_ADDRESS = "0xC1Rc1eN4n0Pay9F8a2bE7c3D5e9F1A4b6C8d0E2f";
export const USDC_CONTRACT_ADDRESS = "0x3600000000000000000000000000000000000000";
export const MOCK_BALANCE = 15.5;

export const ARC_NETWORK = {
  name: "Arc Testnet",
  id: 5042002,
};

export const AGENT_SERVICES_COUNT = 500;
