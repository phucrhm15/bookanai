import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";
import { DEFAULT_LOCALE } from "@/lib/i18n/types";

const MACRO_NEWS_RE =
  /tin tức|tin tuc|vĩ mô|vi mo|chính trị|chinh tri|macro|geopolit|thế giới|the gioi|news|tổng hợp|tong hop|summarize|political|global/i;

const MARKET_DATA_RE =
  /btc|eth|bitcoin|ethereum|sol|giá|gia|price|ath|volume|marketcap|market cap|token|on-chain|onchain|analyze|analysis/i;

export function isMacroNewsPrompt(prompt: string): boolean {
  return MACRO_NEWS_RE.test(prompt);
}

export function isMarketDataPrompt(prompt: string): boolean {
  return MARKET_DATA_RE.test(prompt);
}

export type AgentPromptBehavior = {
  /** full = prompt gửi nguyên văn tới API; partial = chỉ một phần; none = API bỏ qua prompt */
  mode: "full" | "partial" | "none";
  info?: string;
};

export type AgentStudioInput = {
  showPrompt: boolean;
  /** Mô tả agent khi không có ô prompt */
  agentNote?: string;
  /** Placeholder mẫu trong ô prompt */
  promptPlaceholder?: string;
  /** Gợi ý dưới ô prompt (partial / full) */
  promptHint?: string;
};

const PROMPT_PLACEHOLDER_KEYS: Partial<Record<string, string>> = {
  "messari-analyst": "studio.defaultPromptMessari",
  "perplexity-social": "studio.defaultPromptPerplexity",
  "surf-tokenomics": "studio.defaultPromptSurfTokenomics",
};

const AGENT_NOTE_KEYS: Partial<Record<string, string>> = {
  "surf-news": "studio.agentNoteSurfNews",
};

export function getAgentStudioInput(
  agentId: string,
  prompt: string,
  locale: Locale = DEFAULT_LOCALE,
): AgentStudioInput {
  const behavior = agentPromptBehavior(agentId, prompt, locale);

  if (behavior.mode === "none") {
    const noteKey = AGENT_NOTE_KEYS[agentId];
    return {
      showPrompt: false,
      agentNote: noteKey ? translate(locale, noteKey) : behavior.info,
    };
  }

  const placeholderKey = PROMPT_PLACEHOLDER_KEYS[agentId];
  return {
    showPrompt: true,
    promptPlaceholder: placeholderKey ? translate(locale, placeholderKey) : undefined,
    promptHint: behavior.info,
  };
}

export function agentPromptBehavior(
  agentId: string,
  prompt: string,
  locale: Locale = DEFAULT_LOCALE,
): AgentPromptBehavior {
  if (agentId === "surf-news") {
    return { mode: "none" };
  }

  if (agentId === "surf-tokenomics") {
    const symbol = inferSymbolHint(prompt);
    return {
      mode: "partial",
      info: translate(locale, "hints.surfTokenomicsPartial", { symbol }),
    };
  }

  if (agentId === "messari-analyst") {
    return {
      mode: "partial",
      info: translate(locale, "hints.messariPartial"),
    };
  }

  if (agentId === "perplexity-social") {
    return { mode: "full" };
  }

  return { mode: "full" };
}

/** Rough symbol for Surf tokenomics hint (mirrors server inferSurfSymbol). */
function inferSymbolHint(prompt: string): string {
  const text = prompt.toUpperCase();
  const fromDollar = text.match(/\$([A-Z0-9]{2,12})\b/);
  if (fromDollar?.[1]) return fromDollar[1];
  const candidates = text.match(/\b[A-Z]{2,12}\b/g) ?? [];
  for (const token of candidates) {
    if (!["API", "JSON", "HTTP", "USDC", "BASE", "X", "THREAD", "BTC", "ETH", "SOL"].includes(token)) {
      return token;
    }
  }
  if (/\bBTC\b|\bBITCOIN\b/i.test(prompt)) return "BTC";
  if (/\bETH\b|\bETHEREUM\b/i.test(prompt)) return "ETH";
  if (/\bSOL\b|\bSOLANA\b/i.test(prompt)) return "SOL";
  return "AAVE";
}

export function agentPromptMismatch(
  agentId: string,
  prompt: string,
  locale: Locale = DEFAULT_LOCALE,
): { warn: boolean; message?: string } {
  const trimmed = prompt.trim();
  if (!trimmed) return { warn: false };

  if (agentId === "messari-analyst" && isMacroNewsPrompt(trimmed) && !isMarketDataPrompt(trimmed)) {
    return {
      warn: true,
      message: translate(locale, "hints.messariMismatch"),
    };
  }

  if (agentId === "perplexity-social" && isMarketDataPrompt(trimmed) && !isMacroNewsPrompt(trimmed)) {
    return {
      warn: true,
      message: translate(locale, "hints.perplexityMismatch"),
    };
  }

  return { warn: false };
}
