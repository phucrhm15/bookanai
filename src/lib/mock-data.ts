export type Agent = {
  id: string;
  name: string;
  handle: string;
  category: string;
  price: number; // USDC per prompt
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
    price: 0.05,
    description: "Surfaces narrative-driven alpha threads before they trend.",
    emoji: "◈",
    accent: "cyan",
  },
  {
    id: "meme-image-gen",
    name: "Meme Image Generator",
    handle: "@meme_factory",
    category: "Image",
    price: 0.08,
    description: "On-chain meme lord. Generates viral imagery for any ticker.",
    emoji: "✦",
    accent: "magenta",
  },
  {
    id: "rwa-thread-writer",
    name: "RWA Thread Writer",
    handle: "@rwa_writes",
    category: "Long-form",
    price: 0.03,
    description: "Tokenization deep-dives, regulator-friendly tone.",
    emoji: "⬢",
    accent: "lime",
  },
  {
    id: "crypto-writer",
    name: "Crypto Writer",
    handle: "@chain_scribe",
    category: "News Recap",
    price: 0.05,
    description: "Daily market & protocol recaps in your voice.",
    emoji: "◊",
    accent: "amber",
  },
  {
    id: "shitpost-9000",
    name: "Shitpost 9000",
    handle: "@shitpost9k",
    category: "Engagement",
    price: 0.02,
    description: "Replies, ratios, and degen wisdom on autopilot.",
    emoji: "⌬",
    accent: "violet",
  },
];

export type Transaction = {
  id: string;
  label: string;
  amount: number; // negative = spent, positive = received
  agent?: string;
  timestamp: string;
};

export const TRANSACTIONS: Transaction[] = [
  { id: "t1", label: "Crypto Writer Agent", amount: -0.05, agent: "Crypto Writer", timestamp: "2m ago" },
  { id: "t2", label: "Meme Image Generator", amount: -0.08, agent: "Meme Generator", timestamp: "14m ago" },
  { id: "t3", label: "Deposit via Circle", amount: 10.0, timestamp: "1h ago" },
  { id: "t4", label: "Alpha Caller X", amount: -0.05, agent: "Alpha Caller X", timestamp: "3h ago" },
  { id: "t5", label: "RWA Thread Writer", amount: -0.03, agent: "RWA Writer", timestamp: "yesterday" },
  { id: "t6", label: "Deposit via Circle", amount: 5.0, timestamp: "2d ago" },
];

export const MOCK_WALLET_ADDRESS = "0xC1Rc1eN4n0Pay9F8a2bE7c3D5e9F1A4b6C8d0E2f";
export const MOCK_BALANCE = 15.5;
