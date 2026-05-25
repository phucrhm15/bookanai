import { AGENTS } from "@/lib/mock-data";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";

function agentDisplayName(agentId: string): string {
  return AGENTS.find((a) => a.id === agentId)?.name ?? agentId;
}

function translateKey(locale: Locale, key: string, params?: Record<string, string>): string {
  return translate(locale, `ledger.${key}`, params);
}

/** Map legacy Vietnamese/English labels saved before i18n keys. */
const LEGACY_EXACT: Record<string, { key: string; param?: (label: string) => Record<string, string> }> =
  {
    "Nạp USDC · đồng bộ từ ví on-chain": { key: "depositSync" },
    "Deposit via Circle": { key: "depositSync" },
  };

function fromI18nLabel(label: string, locale: Locale): string | undefined {
  if (!label.startsWith("i18n:")) return undefined;
  const body = label.slice(4);
  const parts = body.split(":");

  if (parts[0] === "deposit.sync") {
    return translateKey(locale, "depositSync");
  }
  if (parts[0] === "x402" && parts[1]) {
    return translateKey(locale, "x402", { agent: agentDisplayName(parts[1]) });
  }
  if (parts[0] === "refund.x402" && parts[1]) {
    return translateKey(locale, "refundX402", { agent: agentDisplayName(parts[1]) });
  }
  if (parts[0] === "refund.pending" && parts[1]) {
    return translateKey(locale, "refundPending", { id: parts[1] });
  }
  if (parts[0] === "refund.hold" && parts[1]) {
    return translateKey(locale, "refundHold", { id: parts[1] });
  }
  return undefined;
}

function fromLegacyPatterns(label: string, locale: Locale): string | undefined {
  const exact = LEGACY_EXACT[label];
  if (exact) {
    const params = exact.param?.(label);
    return translateKey(locale, exact.key, params);
  }

  if (label.startsWith("x402 · ")) {
    const agentId = label.slice("x402 · ".length).trim();
    return translateKey(locale, "x402", { agent: agentDisplayName(agentId) });
  }

  if (/đồng bộ từ ví on-chain|synced from on-chain/i.test(label)) {
    return translateKey(locale, "depositSync");
  }

  const refundX402 = label.match(/(?:Hoàn tiền|Refund)\s*·\s*x402\s+(\S+)/i);
  if (refundX402) {
    return translateKey(locale, "refundX402", { agent: agentDisplayName(refundX402[1]) });
  }

  const refundPending = label.match(/(?:Hoàn tiền|Refund)\s*·\s*(?:thanh toán treo|pending)/i);
  if (refundPending) {
    const idMatch = label.match(/[a-f0-9-]{8,}/i);
    return translateKey(locale, "refundPending", { id: idMatch?.[0]?.slice(0, 12) ?? "…" });
  }

  const refundHold = label.match(/(?:Hoàn tiền|Refund)\s*·\s*(?:giữ chỗ|hold)/i);
  if (refundHold) {
    const idMatch = label.match(/[a-f0-9-]{8,}/i);
    return translateKey(locale, "refundHold", { id: idMatch?.[0]?.slice(0, 14) ?? "…" });
  }

  if (/Messari Token Analyst · Nanopayment/i.test(label)) {
    return translateKey(locale, "x402", { agent: "Messari Token Analyst" });
  }
  if (/Perplexity Search Writer · Nanopayment/i.test(label)) {
    return translateKey(locale, "x402", { agent: "Perplexity Search Writer" });
  }

  return undefined;
}

export function formatLedgerLabel(
  label: string,
  _kind: string | undefined,
  locale: Locale,
): string {
  return (
    fromI18nLabel(label, locale) ??
    fromLegacyPatterns(label, locale) ??
    label
  );
}
