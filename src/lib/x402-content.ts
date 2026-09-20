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
