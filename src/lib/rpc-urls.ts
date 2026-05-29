/** Public RPC hosts that reject unauthenticated requests (avoid as fallbacks). */
const BLOCKED_RPC_HOSTS = ["polygon-rpc.com"] as const;

export function isBlockedRpcUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // viem http() transport cannot use websocket endpoints.
    if (parsed.protocol === "ws:" || parsed.protocol === "wss:") return true;
    const host = parsed.hostname.toLowerCase();
    return BLOCKED_RPC_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return false;
  }
}

/** Dedupe and drop known-bad public RPC endpoints. */
export function sanitizeRpcUrls(urls: (string | undefined)[]): string[] {
  return urls.filter((url, index, all): url is string => {
    if (!url?.trim()) return false;
    if (isBlockedRpcUrl(url)) return false;
    return all.indexOf(url) === index;
  });
}
