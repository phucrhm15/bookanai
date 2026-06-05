import { AGENTS, type Agent } from "@/lib/mock-data";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";

const AGENT_I18N_KEYS: Record<
  string,
  "messari" | "perplexity" | "surf" | "surfTokenomics" | "stackB"
> = {
  "messari-analyst": "messari",
  "perplexity-social": "perplexity",
  "surf-news": "surf",
  "surf-tokenomics": "surfTokenomics",
  "crypto-research-b": "stackB",
};

/** Agents with locale-specific description & category (names stay English). */
export function getLocalizedAgents(locale: Locale): Agent[] {
  return AGENTS.map((agent) => {
    const key = AGENT_I18N_KEYS[agent.id];
    if (!key) return agent;
    return {
      ...agent,
      category: translate(locale, `agents.${key}.category`),
      description: translate(locale, `agents.${key}.description`),
    };
  });
}
