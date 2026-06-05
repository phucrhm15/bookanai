import {
  filterMessariRow,
  isExcludedVaultName,
  isMacroExaResult,
  isValidAltTicker,
} from "@/lib/stack-b-exclusions";

export type StackBStepResult = {
  url: string;
  status: number;
  data: unknown;
};

export type StackBReport = {
  stack: "B";
  prompt: string;
  messariSlugs: string[];
  gloriaTickers: string[];
  chargedUsdc: number;
  steps: {
    exa: StackBStepResult;
    messari: StackBStepResult;
    vaultsNetworks: StackBStepResult;
    vaultsVaults: StackBStepResult;
    gloria: Record<string, StackBStepResult>;
  };
};

export function isStackBReport(value: unknown): value is StackBReport {
  return (
    value != null &&
    typeof value === "object" &&
    (value as StackBReport).stack === "B" &&
    typeof (value as StackBReport).steps === "object"
  );
}

function messariRows(data: unknown): Record<string, unknown>[] {
  const root =
    data && typeof data === "object" && "data" in (data as object)
      ? (data as { data: unknown }).data
      : data;
  if (!Array.isArray(root)) return [];
  return root
    .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>) : null))
    .filter((r): r is Record<string, unknown> => r !== null);
}

function vaultItems(data: unknown): Record<string, unknown>[] {
  const root = data as { data?: unknown[] } | unknown[];
  const list = Array.isArray(root) ? root : Array.isArray(root?.data) ? root.data : [];
  return list
    .map((v) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null))
    .filter((r): r is Record<string, unknown> => r !== null);
}

/** Plain-text alt-only report for Studio thread preview. */
export function formatStackBForDisplay(report: StackBReport): string {
  const lines: string[] = [
    "🔬 **ALTCOIN RESEARCH — STACK B**",
    "_Universe: mid-cap alts only · ex BTC, ETH, BNB, XRP & all stables_",
    `~${report.chargedUsdc.toFixed(3)} USDC · Exa + Messari + vaults.fyi + Gloria ×${report.gloriaTickers.length}`,
    "",
    "🌍 **NARRATIVES (Exa)**",
  ];

  const exaRoot =
    report.steps.exa.data && typeof report.steps.exa.data === "object"
      ? (report.steps.exa.data as Record<string, unknown>)
      : null;
  const exaResults = Array.isArray(exaRoot?.results) ? exaRoot!.results : [];
  let exaShown = 0;
  for (const item of exaResults) {
    if (exaShown >= 5) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const snippet =
      typeof row.text === "string"
        ? row.text.slice(0, 220)
        : Array.isArray(row.highlights)
          ? String(row.highlights[0] ?? "").slice(0, 220)
          : "";
    if (!title || isMacroExaResult(title, snippet)) continue;
    lines.push(`• ${title}`);
    if (snippet) lines.push(`  ${snippet}`);
    exaShown++;
  }
  if (!exaShown) lines.push("• (no alt-focused narrative hits — try refining prompt)");

  lines.push("", "📊 **FUNDAMENTALS (Messari)**");
  const assets = messariRows(report.steps.messari.data).filter(filterMessariRow);
  if (assets.length) {
    for (const asset of assets.slice(0, 8)) {
      const sym = String(asset.symbol ?? "?").toUpperCase();
      const name = typeof asset.name === "string" ? asset.name : sym;
      const rank = asset.rank != null ? `#${asset.rank}` : "";
      const sector =
        typeof asset.sector === "string"
          ? asset.sector
          : typeof asset.category === "string"
            ? asset.category
            : "";
      const sectorBit = sector ? ` · ${sector}` : "";
      lines.push(`• **${sym}** ${name} ${rank}${sectorBit}`.trim());
    }
  } else {
    lines.push("• (no alt assets after exclusion filter)");
  }

  lines.push("", "🏦 **DEFI YIELDS (vaults.fyi — alts only)**");
  const networks = report.steps.vaultsNetworks.data;
  if (Array.isArray(networks)) {
    const names = networks
      .slice(0, 6)
      .map((n) => (n as { name?: string }).name)
      .filter(Boolean);
    if (names.length) lines.push(`Chains: ${names.join(", ")}`);
  }
  const altVaults = vaultItems(report.steps.vaultsVaults.data).filter((v) => {
    const name = String(v.name ?? v.symbol ?? v.vaultId ?? "");
    return name && !isExcludedVaultName(name);
  });
  if (altVaults.length) {
    for (const vault of altVaults.slice(0, 5)) {
      const name = String(vault.name ?? vault.vaultId ?? "vault").slice(0, 70);
      const apy =
        vault.apy != null
          ? ` · APY ${Number(vault.apy).toFixed(2)}%`
          : vault.apyBase != null
            ? ` · APY ${Number(vault.apyBase).toFixed(2)}%`
            : "";
      lines.push(`• ${name}${apy}`);
    }
  } else {
    lines.push("• (no non-stable / non-ETH vaults on first page)");
  }

  lines.push("", "📰 **TICKER NEWS (Gloria)**");
  for (const ticker of report.gloriaTickers) {
    if (!isValidAltTicker(ticker)) continue;
    const step = report.steps.gloria[ticker];
    const summary =
      step?.data &&
      typeof step.data === "object" &&
      "summary" in (step.data as object)
        ? String((step.data as { summary?: unknown }).summary ?? "").slice(0, 420)
        : "";
    const isMacro =
      summary &&
      /\b(boj|mufg|iron ore|jgb|yen|628\b|75\b.*boJ|no qualifying)\b/i.test(summary) &&
      !/\b(crypto|token|defi|solana|arbitrum|blockchain)\b/i.test(summary);
    lines.push(`**$${ticker}**`);
    if (summary && !isMacro) {
      lines.push(summary);
    } else {
      lines.push("• No alt-specific headline in last 24h (filtered macro noise).");
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
