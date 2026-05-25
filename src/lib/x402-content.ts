/** Extract display text from x402 marketplace HTTP response (no OpenAI). */
export function extractX402MarketplaceContent(bodyText: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return "Circle x402 marketplace returned an empty response.";
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      for (const key of ["content", "text", "message", "result", "output"]) {
        const val = obj[key];
        if (typeof val === "string" && val.trim()) return val.trim();
      }
      if (obj.data !== undefined) {
        return typeof obj.data === "string"
          ? obj.data
          : JSON.stringify(obj.data, null, 2);
      }
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // plain text / HTML from marketplace
  }

  return trimmed.length > 4000 ? `${trimmed.slice(0, 4000)}…` : trimmed;
}
