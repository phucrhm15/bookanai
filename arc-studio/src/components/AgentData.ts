export type AgentNetwork = 'base' | 'arc-testnet' | 'arc-mainnet';

export type Agent = {
  id: string;
  name: string;
  handle: string;
  category: string;
  price: number;
  description: string;
  icon: string;
  accent: 'cyan' | 'magenta' | 'lime' | 'gold';
  baseUrl: string;
  network: AgentNetwork;
  supportsPrompt: boolean;
  defaultPrompt?: string;
};

export const AGENTS: Agent[] = [
  // ── Arc Mainnet agents ─────────────────────────────────────────────────────
  {
    id: 'arc-defi-oracle',
    name: 'Arc DeFi Oracle',
    handle: '@arc_defi',
    category: 'Arc Mainnet',
    price: 0.012,
    description:
      'Real-time DeFi protocol data on Arc Mainnet — TVL, yields, swap routes. Settled on Arc with USDC as native gas. ~0.012 USDC/run.',
    icon: '⚡',
    accent: 'gold',
    baseUrl: 'https://api.aisa.one',
    network: 'arc-mainnet',
    supportsPrompt: true,
    defaultPrompt: 'What are the top yield opportunities on Arc mainnet today?',
  },
  {
    id: 'arc-mainnet-pulse',
    name: 'Arc Mainnet Pulse',
    handle: '@arc_main_pulse',
    category: 'Arc Mainnet',
    price: 0.015,
    description:
      'Live market intelligence from Arc Mainnet — USDC flows, on-chain metrics, top transactions. ~0.015 USDC/run.',
    icon: '🔥',
    accent: 'gold',
    baseUrl: 'https://api.aisa.one',
    network: 'arc-mainnet',
    supportsPrompt: false,
  },
  {
    id: 'arc-analytics',
    name: 'Arc Chain Analytics',
    handle: '@arc_analytics',
    category: 'Arc Mainnet',
    price: 0.02,
    description:
      'Deep on-chain analytics: wallet flows, contract activity, CCTP bridge volume — all via x402 micropayments on Arc. ~0.02 USDC/run.',
    icon: '📊',
    accent: 'gold',
    baseUrl: 'https://api.aisa.one',
    network: 'arc-mainnet',
    supportsPrompt: true,
    defaultPrompt: 'Analyze USDC bridge volume to Arc mainnet in the last 24 hours',
  },
  // ── Arc Testnet agents ─────────────────────────────────────────────────────
  {
    id: 'arc-market-pulse',
    name: 'Arc Market Pulse',
    handle: '@arc_pulse',
    category: 'Arc Testnet',
    price: 0.008,
    description:
      'Trending crypto categories via x402 — settled on Arc Testnet (USDC gas, no ETH needed). ~0.008 USDC/run.',
    icon: '🌀',
    accent: 'cyan',
    baseUrl: 'https://api.aisa.one',
    network: 'arc-testnet',
    supportsPrompt: false,
  },
  {
    id: 'arc-sonar-brief',
    name: 'Arc Sonar Brief',
    handle: '@arc_sonar',
    category: 'Arc Testnet',
    price: 0.008,
    description:
      'Research brief via Perplexity Sonar x402 — prompts about Arc / USDC-native gas. Arc Testnet settlement path.',
    icon: '📡',
    accent: 'lime',
    baseUrl: 'https://api.aisa.one',
    network: 'arc-testnet',
    supportsPrompt: true,
    defaultPrompt: 'How does Arc use USDC as native gas token?',
  },
  // ── Base agents ────────────────────────────────────────────────────────────
  {
    id: 'perplexity-social',
    name: 'Web Search Writer',
    handle: '@exa_search',
    category: 'Search & News',
    price: 0.007,
    description:
      'Web search via Exa (~0.007 USDC/call). Find news, projects, tokens — Vietnamese or English prompts.',
    icon: '🌍',
    accent: 'magenta',
    baseUrl: 'https://api.exa.ai',
    network: 'base',
    supportsPrompt: true,
    defaultPrompt: 'Latest developments in DeFi this week',
  },
  {
    id: 'surf-news',
    name: 'Surf Crypto News',
    handle: '@surf_ai',
    category: 'News Feed',
    price: 0.001,
    description:
      'AI-curated crypto news feed from Surf (~0.001 USDC/call). Fast market headlines.',
    icon: '🏄',
    accent: 'cyan',
    baseUrl: 'https://nano.blockrun.ai',
    network: 'base',
    supportsPrompt: false,
  },
  {
    id: 'crypto-research-b',
    name: 'Crypto Research Stack B',
    handle: '@stack_b',
    category: 'Research Stack',
    price: 0.11,
    description:
      'Alt-only research (~0.11 USDC): Exa + vaults.fyi + Gloria ticker news ×3. Hard-excludes BTC, ETH, BNB, XRP & stables.',
    icon: '🔬',
    accent: 'lime',
    baseUrl: 'https://agents.circle.com/services',
    network: 'base',
    supportsPrompt: true,
    defaultPrompt: 'Analyze top Layer-2 tokens by TVL growth',
  },
];

export function isArcAgent(agentId: string): boolean {
  const network = AGENTS.find(a => a.id === agentId)?.network;
  return network === 'arc-testnet' || network === 'arc-mainnet';
}

export function isArcMainnetAgent(agentId: string): boolean {
  return AGENTS.find(a => a.id === agentId)?.network === 'arc-mainnet';
}
