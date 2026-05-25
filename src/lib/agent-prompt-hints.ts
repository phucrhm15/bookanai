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
