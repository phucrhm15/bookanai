/**
 * Stack B — strict alt-only universe (ex majors + stables).
 */

export const EXCLUDED_TICKERS = new Set([
  "BTC",
  "ETH",
  "WETH",
  "BNB",
  "WBNB",
  "XRP",
  "USDT",
  "USDC",
  "USDS",
  "DAI",
  "USDE",
  "FRAX",
  "LUSD",
  "TUSD",
  "BUSD",
  "FDUSD",
  "PYUSD",
  "GUSD",
  "CRVUSD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
]);

export const EXCLUDED_SLUGS = new Set([
  "bitcoin",
  "ethereum",
  "binance-coin",
  "xrp",
  "ripple",
  "tether",
  "usd-coin",
  "dai",
  "usds",
  "ethena-usde",
  "frax",
  "paypal-usd",
  "first-digital-usd",
]);

/** Default Messari slugs — mid-cap alts only (no DOGE / majors). */
export const DEFAULT_ALTCOIN_SLUGS = [
  "solana",
  "hyperliquid",
  "avalanche-2",
  "chainlink",
  "arbitrum",
  "optimism",
  "sui",
  "injective",
  "celestia",
  "sei-network",
] as const;

export const DEFAULT_GLORIA_TICKERS = ["HYPE", "ARB", "TIA"] as const;

export const TICKER_TO_SLUG: Record<string, string> = {
  SOL: "solana",
  HYPE: "hyperliquid",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  AAVE: "aave",
  UNI: "uniswap",
  ARB: "arbitrum",
  OP: "optimism",
  SUI: "sui",
  ADA: "cardano",
  DOT: "polkadot",
  NEAR: "near",
  RNDR: "render-token",
  FET: "fetch-ai",
  TIA: "celestia",
  SEI: "sei-network",
  MNT: "mantle",
  APT: "aptos",
  INJ: "injective",
  PENDLE: "pendle",
  JUP: "jupiter-exchange-solana",
  WLD: "worldcoin-wld",
};

const SLUG_TO_TICKER: Record<string, string> = Object.fromEntries(
  Object.entries(TICKER_TO_SLUG).map(([ticker, slug]) => [slug, ticker]),
);

const MACRO_NOISE_RE =
  /\b(bitcoin|ethereum|\bbtc\b|\beth\b|\bxrp\b|\bbnb\b|stablecoin|usdt|usdc|usds|macro|boj|bank of japan|mufg|iron ore|jgb|yen|federal reserve|fed\b|geopolit|trump|tariff)\b/i;

const STABLE_VAULT_RE =
  /\b(usdc|usdt|usds|dai|usd|stable|savings usds|susds|frax|lusd|pyusd|gusd|crvusd|eusd)\b/i;

const ETH_WRAPPED_VAULT_RE = /\b(weth|wsteth|steth|reth|cbeth|eeth|eth\b|ether\.?fi)\b/i;

/** Valid alt ticker: 2–6 uppercase letters, not excluded, not a bare number. */
export function isValidAltTicker(ticker: string): boolean {
  const t = ticker.trim().toUpperCase();
  if (!/^[A-Z]{2,6}$/.test(t)) return false;
  return !EXCLUDED_TICKERS.has(t);
}

export function isExcludedSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return EXCLUDED_SLUGS.has(s);
}

export function slugToTicker(slug: string): string | undefined {
  const key = slug.trim().toLowerCase();
  if (isExcludedSlug(key)) return undefined;
  return SLUG_TO_TICKER[key];
}

export function filterAltSlugs(slugs: string[]): string[] {
  const out: string[] = [];
  for (const raw of slugs) {
    const slug = raw.trim().toLowerCase();
    if (!slug || isExcludedSlug(slug)) continue;
    if (!out.includes(slug)) out.push(slug);
  }
  return out;
}

export function filterAltTickers(tickers: string[]): string[] {
  const out: string[] = [];
  for (const raw of tickers) {
    const t = raw.trim().toUpperCase();
    if (!isValidAltTicker(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Extract alt tickers from text — ignores $75 price patterns and macro tokens. */
export function extractAltTickersFromText(text: string): string[] {
  const found = new Set<string>();

  for (const match of text.matchAll(/\$([A-Za-z]{2,6})\b/g)) {
    const t = match[1]!.toUpperCase();
    if (isValidAltTicker(t)) found.add(t);
  }

  for (const match of text.matchAll(/\b([A-Z]{2,6})\b/g)) {
    const t = match[1]!;
    if (isValidAltTicker(t)) found.add(t);
  }

  return [...found];
}

export function buildStackBExaQuery(userPrompt: string): string {
  const base = userPrompt.trim() || "Top mid-cap altcoin research";
  return (
    `${base}. ` +
    "STRICT ALT-ONLY: exclude Bitcoin BTC Ethereum ETH BNB XRP and ALL stablecoins (USDT USDC USDS DAI FRAX). " +
    "Focus on alt L1/L2/DeFi narratives, TVL shifts, token unlocks, and on-chain activity for tokens like " +
    "SOL AVAX LINK ARB OP SUI HYPE INJ TIA SEI NEAR PENDLE — no macro FX/commodity news."
  );
}

export function messariSlugsForStackB(prompt: string, exaSlugs: string[]): string {
  const fromPrompt = extractAltTickersFromText(prompt)
    .map((t) => TICKER_TO_SLUG[t])
    .filter((s): s is string => Boolean(s));
  const merged = filterAltSlugs([
    ...exaSlugs,
    ...fromPrompt,
    ...DEFAULT_ALTCOIN_SLUGS,
  ]).slice(0, 10);
  return merged.join(",");
}

export function gloriaTickersForStackB(
  prompt: string,
  exaTickers: string[],
  messariSymbols: string[] = [],
): string[] {
  const fromMessari = filterAltTickers(messariSymbols);
  const fromExa = filterAltTickers(exaTickers);
  const fromPrompt = extractAltTickersFromText(prompt);
  const merged = filterAltTickers([
    ...fromMessari,
    ...fromExa,
    ...fromPrompt,
    ...DEFAULT_GLORIA_TICKERS,
  ]);
  return (merged.length >= 3 ? merged : [...DEFAULT_GLORIA_TICKERS]).slice(0, 3);
}

export function extractMessariSymbols(data: unknown): string[] {
  const root =
    data && typeof data === "object" && "data" in (data as object)
      ? (data as { data: unknown }).data
      : data;
  if (!Array.isArray(root)) return [];
  return root
    .map((row) => {
      if (!row || typeof row !== "object") return undefined;
      const sym = (row as { symbol?: unknown }).symbol;
      return typeof sym === "string" ? sym.toUpperCase() : undefined;
    })
    .filter((s): s is string => Boolean(s));
}

export function isMacroExaResult(title: string, snippet: string): boolean {
  const blob = `${title}\n${snippet}`;

  if (/\bBitcoin\s*\(BTC\)|Ethereum\s*\(ETH\)|BNB\s*\(BNB\)|XRP\s*\(XRP\)/i.test(blob)) {
    const altHits = blob.match(
      /\b(SOL|AVAX|ARB|OP|SUI|HYPE|INJ|TIA|SEI|NEAR|LINK|PENDLE|MNT|APT)\b/gi,
    );
    if ((altHits?.length ?? 0) < 2) return true;
  }

  if (MACRO_NOISE_RE.test(blob)) {
    const altMention =
      /\b(solana|\bsol\b|arbitrum|\barb\b|optimism|\bop\b|sui\b|hyperliquid|\bhype\b|injective|\binj\b|celestia|\btia\b|sei\b|avalanche|\bavax\b|chainlink|\blink\b)\b/i.test(
        blob,
      );
    if (!altMention) return true;
  }
  return false;
}

export function isExcludedVaultName(name: string): boolean {
  const n = name.toLowerCase();
  if (STABLE_VAULT_RE.test(n)) return true;
  if (ETH_WRAPPED_VAULT_RE.test(n)) return true;
  if (/\b(bitcoin|btc|bnb|xrp|ripple)\b/.test(n)) return true;
  return false;
}

export function filterMessariRow(row: Record<string, unknown>): boolean {
  const sym = String(row.symbol ?? "").toUpperCase();
  const slug = String(row.slug ?? "").toLowerCase();
  if (sym && !isValidAltTicker(sym)) return false;
  if (slug && isExcludedSlug(slug)) return false;
  return true;
}
