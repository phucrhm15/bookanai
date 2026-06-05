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

/** Plain-text report for Studio thread preview. */
export function formatStackBForDisplay(report: StackBReport): string {
  const lines: string[] = [
    "🔬 **CRYPTO RESEARCH — STACK B**",
    `Prompt: ${report.prompt}`,
    `~${report.chargedUsdc.toFixed(3)} USDC · Exa + Messari + vaults.fyi + Gloria ×${report.gloriaTickers.length}`,
    "",
    "🌍 **WEB SEARCH (Exa)**",
  ];

  const exaRoot =
    report.steps.exa.data && typeof report.steps.exa.data === "object"
      ? (report.steps.exa.data as Record<string, unknown>)
      : null;
  const exaResults = exaRoot?.results;
  if (Array.isArray(exaResults) && exaResults.length) {
    for (const item of exaResults.slice(0, 6)) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title : "Result";
      const snippet =
        typeof row.text === "string"
          ? row.text.slice(0, 200)
          : Array.isArray(row.highlights)
            ? String(row.highlights[0] ?? "").slice(0, 200)
            : "";
      lines.push(`• ${title}`);
      if (snippet) lines.push(`  ${snippet}`);
    }
  } else {
    lines.push("• (no Exa results)");
  }

  lines.push("", "📊 **MESSARI DETAILS**", `Slugs: ${report.messariSlugs.join(", ")}`);
  const messariData =
    report.steps.messari.data &&
    typeof report.steps.messari.data === "object" &&
    "data" in (report.steps.messari.data as object)
      ? (report.steps.messari.data as { data: unknown }).data
      : report.steps.messari.data;
  if (Array.isArray(messariData)) {
    for (const row of messariData.slice(0, 8)) {
      if (!row || typeof row !== "object") continue;
      const asset = row as Record<string, unknown>;
      const sym = String(asset.symbol ?? asset.slug ?? "?").toUpperCase();
      const name = typeof asset.name === "string" ? asset.name : sym;
      const rank = asset.rank != null ? `#${asset.rank}` : "";
      lines.push(`• **${sym}** ${name} ${rank}`.trim());
    }
  }

  lines.push("", "🏦 **VAULTS.FYI**");
  const networks = report.steps.vaultsNetworks.data;
  if (Array.isArray(networks)) {
    lines.push(
      `Networks (${networks.length}): ${networks
        .slice(0, 5)
        .map((n) => (n as { name?: string }).name)
        .filter(Boolean)
        .join(", ")}…`,
    );
  }
  const vaultsRoot = report.steps.vaultsVaults.data as { data?: unknown[] } | unknown[];
  const vaultItems = Array.isArray(vaultsRoot)
    ? vaultsRoot
    : Array.isArray(vaultsRoot?.data)
      ? vaultsRoot.data
      : [];
  if (vaultItems.length) {
    lines.push(`Top vaults (${vaultItems.length} on page):`);
    for (const v of vaultItems.slice(0, 4)) {
      if (!v || typeof v !== "object") continue;
      const vault = v as Record<string, unknown>;
      const name = String(vault.name ?? vault.vaultId ?? "vault").slice(0, 60);
      lines.push(`• ${name}`);
    }
  }

  lines.push("", "📰 **GLORIA TICKER NEWS**");
  for (const ticker of report.gloriaTickers) {
    const step = report.steps.gloria[ticker];
    const summary =
      step?.data &&
      typeof step.data === "object" &&
      "summary" in (step.data as object)
        ? String((step.data as { summary?: unknown }).summary ?? "").slice(0, 400)
        : "";
    lines.push(`**$${ticker}**`);
    lines.push(summary || "• (no summary)");
    lines.push("");
  }

  return lines.join("\n").trim();
}
