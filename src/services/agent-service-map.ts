import { getServerEnv } from "@/server/config/env";

export type DiscoveryAccept = {
  scheme: string;
  network: string;
  amount: string;
};

export type DiscoveryItem = {
  resource: string;
  type: string;
  accepts?: DiscoveryAccept[];
};

type DiscoveryResponse = {
  items?: DiscoveryItem[];
};

/**
 * Studio agent id → Circle x402 Discovery resource URL (or Messari direct x402 URL).
 * Each URL must be payable via x402 (HTTP 402 + USDC) at resolve time.
 */
export const STUDIO_AGENT_RESOURCES: Record<string, string> = {
  /** Messari x402 — /details returns 403 after pay; /ath works with exact EIP-3009 */
  "messari-analyst": "https://api.messari.io/metrics/v2/assets/ath",
  /** Exa web search — AIsa Perplexity removed from Circle Discovery (2026) */
  "perplexity-social": "https://api.exa.ai/search",
  "surf-news": "https://nano.blockrun.ai/api/v1/surf/news/feed",
  "surf-tokenomics": "https://nano.blockrun.ai/api/v1/surf/token/tokenomics",
  /** Orchestrated multi-API workflow — probe uses Exa entry point */
  "crypto-research-b": "https://api.exa.ai/search",
};

/** UI estimate when Discovery has no accepts and live 402 probe is inconclusive */
export const STUDIO_AGENT_FALLBACK_PRICE_USDC: Partial<Record<string, number>> = {
  "perplexity-social": 0.007,
  "surf-news": 0.001,
  "surf-tokenomics": 0.0019,
  "messari-analyst": 0.1,
  "crypto-research-b": 0.218,
};

/** Hosts with native x402 not yet mirrored in Circle Discovery catalog */
const DIRECT_X402_HOSTS = new Set([
  "api.messari.io",
  "nano.blockrun.ai",
  "api.exa.ai",
  "api.vaults.fyi",
  "api.itsgloria.ai",
]);

/** All HTTPS hosts from STUDIO_AGENT_RESOURCES (+ DIRECT_X402_HOSTS). */
function studioAllowlistedHosts(): Set<string> {
  const hosts = new Set(DIRECT_X402_HOSTS);
  for (const url of Object.values(STUDIO_AGENT_RESOURCES)) {
    try {
      hosts.add(new URL(url).hostname.toLowerCase());
    } catch {
      // skip malformed entries
    }
  }
  return hosts;
}

function isDirectX402MappedUrl(resourceUrl: string): boolean {
  try {
    return studioAllowlistedHosts().has(new URL(resourceUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export type ResolvedAgentResource = {
  resourceUrl: string;
  discoveryItem: DiscoveryItem;
};

let discoveryCache: DiscoveryItem[] | undefined;
let discoveryFetchedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

const AGENT_NOT_FOUND =
  "Agent không tồn tại hoặc đã bị gỡ khỏi chợ x402";

function discoveryUrl(): string {
  return getServerEnv().X402_DISCOVERY_URL;
}

function discoveryCatalogHosts(items: DiscoveryItem[]): Set<string> {
  const hosts = new Set<string>();
  for (const item of items) {
    if (!item.resource) continue;
    try {
      hosts.add(new URL(item.resource).hostname.toLowerCase());
    } catch {
      // skip malformed catalog entries
    }
  }
  return hosts;
}

/** Host must be listed on Circle Discovery or belong to Circle x402 ecosystem (HTTPS only). */
function assertX402ResourceHost(
  resourceUrl: string,
  catalogItems: DiscoveryItem[],
): void {
  let parsed: URL;
  try {
    parsed = new URL(resourceUrl);
  } catch {
    throw new Error(`${AGENT_NOT_FOUND}: URL không hợp lệ`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${AGENT_NOT_FOUND}: chỉ chấp nhận HTTPS`);
  }

  const host = parsed.hostname.toLowerCase();
  const catalogHosts = discoveryCatalogHosts(catalogItems);

  if (catalogHosts.has(host) || studioAllowlistedHosts().has(host)) {
    return;
  }

  const extra =
    process.env.X402_ALLOWED_RESOURCE_HOSTS?.split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean) ?? [];

  const circleEcosystem =
    host === "circle.com" ||
    host.endsWith(".circle.com") ||
    host.endsWith(".circleapis.com");

  const explicitlyAllowed = extra.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );

  if (!circleEcosystem && !explicitlyAllowed) {
    throw new Error(
      `${AGENT_NOT_FOUND}: domain "${host}" không thuộc x402 ecosystem của Circle`,
    );
  }
}

export async function fetchDiscoveryResources(): Promise<DiscoveryItem[]> {
  const now = Date.now();
  if (discoveryCache && now - discoveryFetchedAt < CACHE_MS) {
    return discoveryCache;
  }

  const url = discoveryUrl();
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`X402 Discovery failed (${url}): ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as DiscoveryResponse;
  discoveryCache = body.items ?? [];
  discoveryFetchedAt = now;
  return discoveryCache;
}

export function findDiscoveryItemForResource(
  items: DiscoveryItem[],
  resourceUrl: string,
): DiscoveryItem | undefined {
  const exact = items.find(
    (item) => item.type === "http" && item.resource === resourceUrl,
  );
  if (exact) return exact;

  try {
    const target = new URL(resourceUrl);
    const path = target.pathname.replace(/\/$/, "");
    return items.find((item) => {
      if (item.type !== "http" || !item.resource) return false;
      try {
        const u = new URL(item.resource);
        return (
          u.hostname.toLowerCase() === target.hostname.toLowerCase() &&
          u.pathname.replace(/\/$/, "") === path
        );
      } catch {
        return false;
      }
    });
  } catch {
    return undefined;
  }
}

export async function getDiscoveryCatalogItem(
  resourceUrl: string,
): Promise<DiscoveryItem | undefined> {
  const items = await fetchDiscoveryResources();
  return findDiscoveryItemForResource(items, resourceUrl);
}

/**
 * Resolve a paid x402 resource URL for a Studio agent id.
 * Circle Discovery exact match first; Messari uses direct x402 catalog when absent.
 */
export async function resolveAgentResource(
  agentId: string,
): Promise<ResolvedAgentResource> {
  const mappedUrl = STUDIO_AGENT_RESOURCES[agentId];
  if (!mappedUrl) {
    throw new Error(`Unknown Studio agent id: ${agentId}`);
  }

  // Mapped Studio agents always resolve — Discovery enriches accepts/price when listed.
  let items: DiscoveryItem[] = [];
  try {
    items = await fetchDiscoveryResources();
  } catch (error) {
    console.warn("[x402] Discovery fetch failed; using mapped resource URL:", error);
  }

  const discoveryItem =
    findDiscoveryItemForResource(items, mappedUrl) ??
    ({ resource: mappedUrl, type: "http" } satisfies DiscoveryItem);

  assertX402ResourceHost(discoveryItem.resource, items);

  return { resourceUrl: discoveryItem.resource, discoveryItem };
}

/** @deprecated use resolveAgentResource */
export async function resolveAgentServiceUrl(agentId: string): Promise<string> {
  const resolved = await resolveAgentResource(agentId);
  return resolved.resourceUrl;
}
