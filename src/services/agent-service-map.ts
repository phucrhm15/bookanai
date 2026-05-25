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
  "perplexity-social": "https://api.aisa.one/apis/v2/perplexity/sonar",
};

/** Hosts with native x402 not yet mirrored in Circle Discovery catalog */
const DIRECT_X402_HOSTS = new Set(["api.messari.io"]);

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

  if (catalogHosts.has(host) || DIRECT_X402_HOSTS.has(host)) {
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

function findDiscoveryItem(
  items: DiscoveryItem[],
  resourceUrl: string,
): DiscoveryItem | undefined {
  return items.find(
    (item) => item.type === "http" && item.resource === resourceUrl,
  );
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

  const items = await fetchDiscoveryResources();
  let discoveryItem = findDiscoveryItem(items, mappedUrl);

  if (!discoveryItem) {
    const host = new URL(mappedUrl).hostname.toLowerCase();
    if (DIRECT_X402_HOSTS.has(host)) {
      discoveryItem = { resource: mappedUrl, type: "http" };
    }
  }

  if (!discoveryItem?.resource) {
    throw new Error(AGENT_NOT_FOUND);
  }

  assertX402ResourceHost(discoveryItem.resource, items);

  return { resourceUrl: discoveryItem.resource, discoveryItem };
}

/** @deprecated use resolveAgentResource */
export async function resolveAgentServiceUrl(agentId: string): Promise<string> {
  const resolved = await resolveAgentResource(agentId);
  return resolved.resourceUrl;
}
