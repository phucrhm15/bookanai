/**
 * Format Polymarket crypto-updown response as tweet thread.
 * Response shape: { markets: [{ title, slug, volume24h, yesAsk, noBid, ... }] }
 */
function formatPolymarketCryptoUpdown(obj: Record<string, unknown>): string | null {
  const markets = obj.markets ?? obj.results ?? obj.data;
  if (!Array.isArray(markets) || markets.length === 0) return null;

  const lines: string[] = ["📊 Polymarket Crypto Prediction Pulse\n"];
  for (const m of markets.slice(0, 6)) {
    const item = m as Record<string, unknown>;
    const title = item.title ?? item.question ?? item.slug ?? "Unknown";
    const yes = item.yesAsk ?? item.yes ?? item.yesBid ?? item.bestAsk;
    const no = item.noBid ?? item.no ?? item.noAsk ?? item.bestBid;
    const vol = item.volume24h ?? item.volume ?? item.liquidity;
    const yesStr = typeof yes === "number" ? `${(yes * 100).toFixed(0)}¢ YES` : "";
    const noStr = typeof no === "number" ? `${(no * 100).toFixed(0)}¢ NO` : "";
    const volStr = typeof vol === "number" ? ` | Vol $${vol.toFixed(0)}` : "";
    lines.push(`• ${title}\n  ${[yesStr, noStr].filter(Boolean).join(" / ")}${volStr}`);
  }
  lines.push("\n🔗 nano.blockrun.ai · pay per call via x402 USDC");
  return lines.join("\n");
}

/** Extract display text from x402 marketplace HTTP response (no OpenAI). */
export function extractX402MarketplaceContent(bodyText: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return "Circle x402 marketplace returned an empty response.";
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed;

    // Array at root = tweet thread
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
        .join("\n\n");
    }

    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;

      // Polymarket crypto-updown response (nano.blockrun.ai)
      const polyFmt = formatPolymarketCryptoUpdown(obj);
      if (polyFmt) return polyFmt;

      // Explicit tweet-thread keys (api.aisa.one + common marketplace formats)
      for (const key of ["tweets", "thread", "items", "posts"]) {
        const val = obj[key];
        if (Array.isArray(val) && val.length > 0) {
          return val
            .map((item) => (typeof item === "string" ? item : (item as Record<string, unknown>).text ?? JSON.stringify(item)))
            .join("\n\n");
        }
      }

      // Plain string fields
      for (const key of ["content", "text", "message", "result", "output", "summary", "answer"]) {
        const val = obj[key];
        if (typeof val === "string" && val.trim()) return val.trim();
      }

      // Nested data object
      if (obj.data !== undefined) {
        if (typeof obj.data === "string") return obj.data;
        if (Array.isArray(obj.data)) {
          return (obj.data as unknown[])
            .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
            .join("\n\n");
        }
        return JSON.stringify(obj.data, null, 2);
      }

      // Last resort: pretty-print JSON so the user sees the raw payload
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // plain text / HTML from marketplace
  }

  return trimmed.length > 4000 ? `${trimmed.slice(0, 4000)}…` : trimmed;
}
