const DISCOVERY_URL =
  process.env.X402_DISCOVERY_URL ?? "https://api.circle.com/v2/x402/discovery/resources";

type DiscoveryAccept = {
  scheme: string;
  network: string;
  amount: string;
};

type DiscoveryItem = {
  resource: string;
  type: string;
  accepts?: DiscoveryAccept[];
};

type DiscoveryResponse = {
  items?: DiscoveryItem[];
};

/** Mock agent id → keywords used to pick an x402 marketplace resource URL. */
export const AGENT_DISCOVERY_KEYWORDS: Record<string, string[]> = {
  "alpha-caller-x": ["coingecko", "coins", "market", "price"],
  "meme-image-gen": ["image", "generate", "visual"],
  "rwa-thread-writer": ["treasury", "rwa", "tokenized"],
  "crypto-writer": ["coingecko", "coins", "categories"],
  "shitpost-9000": ["sentiment", "social", "twitter"],
  "sentiment-scanner": ["sentiment", "mood", "social"],
};

/** Curated fallbacks when discovery has no keyword match (Arc-friendly HTTP resources). */
const AGENT_FALLBACK_URLS: Record<string, string> = {
  "alpha-caller-x": "https://api.aisa.one/apis/v2/coingecko/coins/categories",
  "meme-image-gen": "https://api.aisa.one/apis/v2/coingecko/coins/categories",
  "rwa-thread-writer": "https://api.aisa.one/apis/v2/coingecko/coins/categories",
  "crypto-writer": "https://api.aisa.one/apis/v2/coingecko/coins/categories",
  "shitpost-9000": "https://api.aisa.one/apis/v2/coingecko/coins/categories",
  "sentiment-scanner": "https://api.aisa.one/apis/v2/coingecko/coins/categories",
};

let discoveryCache: DiscoveryItem[] | undefined;
let discoveryFetchedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

export async function fetchDiscoveryResources(): Promise<DiscoveryItem[]> {
  const now = Date.now();
  if (discoveryCache && now - discoveryFetchedAt < CACHE_MS) {
    return discoveryCache;
  }
  const res = await fetch(DISCOVERY_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Discovery API failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as DiscoveryResponse;
  discoveryCache = body.items ?? [];
  discoveryFetchedAt = now;
  return discoveryCache;
}

function scoreResource(resource: string, keywords: string[]): number {
  const lower = resource.toLowerCase();
  return keywords.reduce((score, kw) => (lower.includes(kw.toLowerCase()) ? score + 1 : score), 0);
}

export async function resolveAgentServiceUrl(agentId: string): Promise<string> {
  const keywords = AGENT_DISCOVERY_KEYWORDS[agentId];
  if (!keywords?.length) {
    throw new Error(`Unknown agent service id: ${agentId}`);
  }

  try {
    const items = await fetchDiscoveryResources();
    let best: DiscoveryItem | undefined;
    let bestScore = 0;
    for (const item of items) {
      if (item.type !== "http" || !item.resource) continue;
      const score = scoreResource(item.resource, keywords);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    if (best?.resource) return best.resource;
  } catch (err) {
    console.warn("[agent-service-map] discovery lookup failed, using fallback:", err);
  }

  const fallback = AGENT_FALLBACK_URLS[agentId];
  if (!fallback) throw new Error(`No marketplace URL for agent: ${agentId}`);
  return fallback;
}
