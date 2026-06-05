import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BadgeCheck, Check, Copy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-context";
import type { TranslateParams } from "@/lib/i18n/translate";
import { formatStackBForDisplay, isStackBReport } from "@/lib/stack-b-format";

const TWEET_MAX = 280;

/** Mathematical Sans-Serif Bold (U+1D5D4 A–Z, U+1D5EE a–z, U+1D7EC 0–9). */
function toUnicodeSansSerifBoldChar(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return String.fromCodePoint(0x1d5d4 + (code - 65));
  }
  if (code >= 97 && code <= 122) {
    return String.fromCodePoint(0x1d5ee + (code - 97));
  }
  if (code >= 48 && code <= 57) {
    return String.fromCodePoint(0x1d7ec + (code - 48));
  }
  return char;
}

function boldifyAsciiLetters(segment: string): string {
  return [...segment].map(toUnicodeSansSerifBoldChar).join("");
}

/** X only has sans-serif bold glyphs for A–Z / a–z / 0–9 — not Vietnamese diacritics. */
function canUseUnicodeBoldOnX(inner: string): boolean {
  return /^[\x20-\x7E]+$/.test(inner) && /[A-Za-z]/.test(inner);
}

/**
 * Converts `**markdown bold**` to Unicode bold for X paste when safe (ASCII only).
 * Vietnamese / accented text stays normal so X does not mix bold + fallback fonts.
 */
export function convertMarkdownToUnicodeBold(input: string): string {
  return input.replace(/\*\*([^*]+)\*\*/g, (_match, inner: string) => {
    const text = inner.trim();
    if (canUseUnicodeBoldOnX(text)) {
      return boldifyAsciiLetters(text);
    }
    return text;
  });
}

/** In-app preview: Unicode bold for ASCII titles, normal <strong> for Vietnamese. */
function renderMarkdownBoldPreview(input: string): ReactNode[] {
  const parts = input.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    const match = part.match(/^\*\*([^*]+)\*\*$/);
    if (!match) {
      return <span key={index}>{part}</span>;
    }
    const text = match[1].trim();
    if (canUseUnicodeBoldOnX(text)) {
      return <span key={index}>{boldifyAsciiLetters(text)}</span>;
    }
    return (
      <strong key={index} className="font-semibold">
        {text}
      </strong>
    );
  });
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function pickString(obj: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
    if (typeof val === "number" && Number.isFinite(val)) return String(val);
  }
  return undefined;
}

function formatUsd(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return typeof value === "string" ? value : undefined;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

function extractMessariRows(data: unknown): JsonRecord[] {
  if (Array.isArray(data)) {
    return data.map(asRecord).filter((r): r is JsonRecord => r !== null);
  }
  const root = asRecord(data);
  if (!root) return [];
  const nested = root.data;
  if (Array.isArray(nested)) {
    return nested.map(asRecord).filter((r): r is JsonRecord => r !== null);
  }
  const single = asRecord(nested);
  return single ? [single] : [root];
}

type TFn = (key: string, params?: TranslateParams) => string;

function messariAthLine(row: JsonRecord, t: TFn): string | undefined {
  const ath = asRecord(row.allTimeHigh) ?? row;
  const athPrice = formatUsd(
    ath.allTimeHigh ??
      ath.price ??
      row.price ??
      row.price_usd ??
      row.current_price,
  );
  const athDate = pickString(ath, ["allTimeHighDate", "date", "athDate"]);
  const pctDown =
    ath.percentDownFromAllTimeHigh ??
    ath.allTimeHighPercentDown ??
    row.percentDownFromAllTimeHigh;
  const pctStr =
    pctDown != null && Number.isFinite(Number(pctDown))
      ? t("thread.messariAthDown", { pct: Number(pctDown).toFixed(1) })
      : undefined;

  const bits: string[] = [];
  if (athPrice) bits.push(`ATH: ${athPrice}`);
  if (athDate) bits.push(`(${athDate.slice(0, 10)})`);
  if (pctStr) bits.push(pctStr);
  return bits.length ? bits.join(" ") : undefined;
}

/** Format raw Messari JSON into a postable market-update block. */
function formatMessariData(data: unknown, t: TFn): string {
  const rows = extractMessariRows(data).slice(0, 8);
  if (!rows.length) {
    return t("thread.messariEmpty");
  }

  const lines: string[] = [t("thread.messariHeader"), t("thread.messariHint"), ""];

  for (const row of rows) {
    const name =
      pickString(row, ["name", "symbol", "slug", "id", "asset"])?.toUpperCase() ?? "TOKEN";
    const price = formatUsd(
      row.price ??
        row.price_usd ??
        row.current_price ??
        row.market_price_usd ??
        row.close,
    );
    const volume = formatUsd(
      row.volume ?? row.volume_24h ?? row.volume24h ?? row.trading_volume_24h,
    );
    const marketcap = formatUsd(
      row.marketcap ?? row.market_cap ?? row.market_cap_usd ?? row.marketcap_usd,
    );
    const athLine = messariAthLine(row, t);

    lines.push(`**${name}**`);
    if (price) lines.push(`• ${t("thread.messariPrice", { price })}`);
    if (athLine) lines.push(`• ${athLine}`);
    if (volume) lines.push(`• ${t("thread.messariVol", { vol: volume })}`);
    if (marketcap) lines.push(`• ${t("thread.messariMcap", { mcap: marketcap })}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}

/** Format raw Perplexity / search JSON into a macro-news block. */
function formatPerplexityData(data: unknown, t: TFn): string {
  const root = asRecord(data);
  const header = t("thread.perplexityHeader");
  if (!root) {
    return typeof data === "string" ? `${header}\n${data}` : t("thread.perplexityEmpty");
  }

  const direct =
    pickString(root, ["text", "content", "message", "output", "answer", "result"]) ??
    (typeof root.data === "string" ? root.data : undefined);

  if (direct) {
    return `${header}\n${direct}`;
  }

  const choices = root.choices;
  if (Array.isArray(choices)) {
    const texts = choices
      .map((c) => {
        const choice = asRecord(c);
        const msg = choice ? asRecord(choice.message) : null;
        return msg ? pickString(msg, ["content", "text"]) : undefined;
      })
      .filter((t): t is string => Boolean(t));
    if (texts.length) {
      return `${header}\n${texts.join("\n\n")}`;
    }
  }

  const searchResults = root.results;
  if (Array.isArray(searchResults)) {
    const lines = searchResults
      .slice(0, 8)
      .map((item) => asRecord(item))
      .filter((item): item is JsonRecord => Boolean(item))
      .map((item) => {
        const title = pickString(item, ["title", "headline", "name"]);
        const desc =
          pickString(item, ["text", "summary", "snippet", "description"]) ??
          (Array.isArray(item.highlights) ? String(item.highlights[0] ?? "") : undefined);
        const url = pickString(item, ["url", "link"]);
        const lead = title ? `• ${title}` : "• Result";
        const detail = desc ? `\n  ${desc.slice(0, 280)}` : "";
        const link = url ? `\n  ${url}` : "";
        return `${lead}${detail}${link}`;
      });
    if (lines.length) return `${header}\n${lines.join("\n")}`;
  }

  const dataObj = asRecord(root.data);
  if (dataObj) {
    const nested = pickString(dataObj, ["text", "content", "answer"]);
    if (nested) return `${header}\n${nested}`;
  }

  return `${header}\n${JSON.stringify(root, null, 2).slice(0, 2000)}`;
}

/** Format Surf feed/tokenomics payloads into short postable bullets. */
function formatSurfData(data: unknown, t: TFn, tokenomics = false): string {
  const header = tokenomics ? t("thread.surfTokenomicsHeader") : t("thread.surfHeader");
  const empty = tokenomics ? t("thread.surfTokenomicsEmpty") : t("thread.surfEmpty");
  const root = asRecord(data);
  if (!root) {
    return typeof data === "string" ? `${header}\n${data}` : empty;
  }

  const direct =
    pickString(root, ["text", "content", "message", "summary", "result"]) ??
    (typeof root.data === "string" ? root.data : undefined);
  if (direct) return `${header}\n${direct}`;

  const listCandidate = root.data ?? root.items ?? root.results ?? root.news ?? root.feed;
  if (Array.isArray(listCandidate)) {
    const lines = listCandidate
      .slice(0, 8)
      .map((item) => asRecord(item))
      .filter((item): item is JsonRecord => Boolean(item))
      .map((item) => {
        const title = pickString(item, ["title", "headline", "name", "text"]);
        const desc = pickString(item, ["summary", "description", "snippet"]);
        const source = pickString(item, ["source", "domain", "publisher"]);
        const lead = title ? `• ${title}` : "• Update";
        const detail = desc ? `\n  ${desc}` : "";
        const from = source ? `\n  (${source})` : "";
        return `${lead}${detail}${from}`;
      });
    if (lines.length) return `${header}\n${lines.join("\n")}`;
  }

  return `${header}\n${JSON.stringify(root, null, 2).slice(0, 2000)}`;
}

/**
 * Parse raw x402 API JSON by agent and return a single formatted string
 * (before thread splitting).
 */
export function parseAgentData(agentId: string, rawResponse: string, t: TFn): string {
  const trimmed = rawResponse.trim();
  if (!trimmed) {
    return agentId === "messari-analyst"
      ? `${t("thread.messariHeader")}\n${t("thread.responseEmpty")}`
      : agentId === "surf-news"
        ? `${t("thread.surfHeader")}\n${t("thread.responseEmpty")}`
        : agentId === "surf-tokenomics"
          ? `${t("thread.surfTokenomicsHeader")}\n${t("thread.responseEmpty")}`
        : `${t("thread.perplexityHeader")}\n${t("thread.responseEmpty")}`;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (agentId === "messari-analyst") return formatMessariData(parsed, t);
    if (agentId === "perplexity-social") return formatPerplexityData(parsed, t);
    if (agentId === "surf-news") return formatSurfData(parsed, t);
    if (agentId === "surf-tokenomics") return formatSurfData(parsed, t, true);
    if (agentId === "crypto-research-b" && isStackBReport(parsed)) {
      return formatStackBForDisplay(parsed);
    }
    if (typeof parsed === "string") return parsed;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return trimmed;
  }
}

/** Split formatted text into X-sized tweets with 1/x numbering. */
export function splitIntoTweets(text: string, maxLen = TWEET_MAX): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  const paragraphs = normalized.split(/\n+/);

  let buffer = "";
  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim());
    buffer = "";
  };

  for (const para of paragraphs) {
    const line = para.trim();
    if (!line) continue;

    const candidate = buffer ? `${buffer}\n${line}` : line;
    if (candidate.length <= maxLen) {
      buffer = candidate;
      continue;
    }

    flush();

    if (line.length <= maxLen) {
      buffer = line;
      continue;
    }

    let offset = 0;
    while (offset < line.length) {
      chunks.push(line.slice(offset, offset + maxLen));
      offset += maxLen;
    }
  }

  flush();

  const total = chunks.length || 1;
  const bodyChunks = chunks.length ? chunks : [normalized.slice(0, maxLen)];

  return bodyChunks.map((body, index) => {
    const prefix = `${index + 1}/${total}\n`;
    const budget = maxLen - prefix.length;
    const trimmedBody = body.length > budget ? `${body.slice(0, budget - 1)}…` : body;
    return `${prefix}${trimmedBody}`;
  });
}

export type TweetThreadPreviewProps = {
  agentId: string;
  authorName: string;
  authorHandle: string;
  avatarEmoji?: string;
  avatarUrl?: string;
  rawResponse?: string | null;
  loading?: boolean;
};

function ThreadAvatar({
  authorName,
  avatarEmoji,
  avatarUrl,
}: {
  authorName: string;
  avatarEmoji: string;
  avatarUrl?: string;
}) {
  return (
    <Avatar className="h-11 w-11 shrink-0">
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={authorName} /> : null}
      <AvatarFallback className="bg-gradient-neon font-display text-xl text-neon-foreground shadow-neon">
        {avatarEmoji}
      </AvatarFallback>
    </Avatar>
  );
}

export function TweetThreadPreview({
  agentId,
  authorName,
  authorHandle,
  avatarEmoji = "◈",
  avatarUrl,
  rawResponse,
  loading = false,
}: TweetThreadPreviewProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { t } = useTranslation();

  const tweets = useMemo(() => {
    if (!rawResponse?.trim()) return [];
    const formatted = parseAgentData(agentId, rawResponse, t);
    return splitIntoTweets(formatted).map((chunk) => ({
      preview: chunk,
      copy: convertMarkdownToUnicodeBold(chunk),
    }));
  }, [agentId, rawResponse, t]);

  const handleCopy = useCallback((text: string, index: number) => {
    if (typeof window === "undefined" || !navigator.clipboard) {
      return;
    }

    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        toast.success(t("thread.copied"));
        setTimeout(() => setCopiedIndex(null), 2000);
      } catch {
        toast.error(t("thread.copyFailed"));
      }
    })();
  }, [t]);

  if (loading) {
    return (
      <div className="space-y-3">
        <article className="rounded-xl border border-border/60 bg-card/80 p-4">
          <div className="flex gap-3">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[90%]" />
              <Skeleton className="h-3 w-[60%]" />
            </div>
          </div>
        </article>
      </div>
    );
  }

  if (!tweets.length) {
    return (
      <article className="rounded-xl border border-border/60 bg-card/80 p-4 backdrop-blur-xl">
        <p className="text-sm text-muted-foreground">{t("thread.previewEmpty")}</p>
      </article>
    );
  }

  return (
    <div className="space-y-3">
      {tweets.map(({ preview, copy }, index) => (
        <article
          key={index}
          className="rounded-xl border border-border/60 bg-card/80 p-4 backdrop-blur-xl"
        >
          <div className="flex gap-3">
            <ThreadAvatar
              authorName={authorName}
              avatarEmoji={avatarEmoji}
              avatarUrl={avatarUrl}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1 text-sm">
                  <span className="truncate font-semibold text-foreground">{authorName}</span>
                  <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate text-muted-foreground">{authorHandle}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-[10px] uppercase tracking-wider"
                  onClick={() => handleCopy(copy, index)}
                >
                  {copiedIndex === index ? (
                    <>
                      <Check className="h-3 w-3 text-success" />
                      {t("thread.copied")}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      {t("thread.copy")}
                    </>
                  )}
                </Button>
              </div>
              <div
                className={cn(
                  "mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground",
                  index > 0 && "border-l-2 border-primary/30 pl-3",
                )}
              >
                {renderMarkdownBoldPreview(preview)}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
