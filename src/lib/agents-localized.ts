import { AGENTS, type Agent } from "@/lib/mock-data";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";

const REMOVED_AGENT_IDS = new Set(["messari-analyst", "surf-tokenomics"]);

const AGENT_I18N_KEYS: Record<
  string,
  "perplexity" | "surf" | "stackB" | "arcMarketPulse" | "arcSonarBrief"
> = {
  "perplexity-social": "perplexity",
  "surf-news": "surf",
  "crypto-research-b": "stackB",
  "arc-market-pulse": "arcMarketPulse",
  "arc-sonar-brief": "arcSonarBrief",
};

/** Agents with locale-specific description & category (names stay English). */
export function getLocalizedAgents(locale: Locale): Agent[] {
  return AGENTS.filter((agent) => !REMOVED_AGENT_IDS.has(agent.id)).map((agent) => {
    const key = AGENT_I18N_KEYS[agent.id];
    if (!key) return agent;
    return {
      ...agent,
      category: translate(locale, `agents.${key}.category`),
      description: translate(locale, `agents.${key}.description`),
    };
  });
}

export function getLocalizedAgentsByNetwork(
  locale: Locale,
  network: Agent["network"],
): Agent[] {
  return getLocalizedAgents(locale).filter((a) => a.network === network);
}

export function getLocalizedArcMainnetAgents(locale: Locale): Agent[] {
  return getLocalizedAgents(locale).filter((a) => a.network === "arc");
}
