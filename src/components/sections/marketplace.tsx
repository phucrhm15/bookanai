import { useMemo, useState } from "react";
import { AGENT_SERVICES_COUNT, type Agent } from "@/lib/mock-data";
import { getLocalizedAgents } from "@/lib/agents-localized";
import { useActiveAgent } from "@/lib/agent-store";
import { useTranslation } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Check, Search, Sparkles, Zap } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const accentMap: Record<Agent["accent"], string> = {
  cyan: "from-primary/30 to-primary/0 text-primary",
  magenta: "from-magenta/30 to-magenta/0 text-magenta",
  lime: "from-success/30 to-success/0 text-success",
  amber: "from-magenta/20 to-transparent text-magenta",
  violet: "from-accent/60 to-transparent text-foreground",
};

export function Marketplace() {
  const { activeAgent, setActiveAgent } = useActiveAgent();
  const navigate = useNavigate();
  const { t, locale } = useTranslation();
  const [query, setQuery] = useState("");

  const agents = useMemo(() => getLocalizedAgents(locale), [locale]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.handle.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q),
    );
  }, [query, agents]);

  const onSelect = (agent: Agent) => {
    setActiveAgent(agent);
    toast.success(t("marketplace.toastActive", { name: agent.name }), {
      description: t("marketplace.toastActiveDesc", { price: agent.price }),
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6 flex flex-col gap-3 md:mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-primary/40 bg-primary/10 font-mono text-[10px] uppercase tracking-[0.2em] text-primary"
          >
            {t("marketplace.badge")}
          </Badge>
          <Badge
            variant="outline"
            className="gap-1 border-border/60 bg-card/60 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            <Zap className="h-3 w-3 text-primary" />
            {t("marketplace.poweredBy")}{" "}
            <span className="text-foreground">agents.circle.com/services</span>
          </Badge>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          {t("marketplace.title")}{" "}
          <span className="text-gradient-neon">{t("marketplace.titleAccent")}</span>
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("marketplace.subtitle")}</p>
      </header>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("marketplace.searchPlaceholder")}
            className="border-border/60 bg-card/60 pl-9 font-mono text-sm placeholder:text-muted-foreground/70"
          />
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("marketplace.agentsCount", { count: filtered.length, total: AGENT_SERVICES_COUNT })}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {filtered.map((agent) => {
          const active = activeAgent.id === agent.id;
          return (
            <article
              key={agent.id}
              className={cn(
                "group relative overflow-hidden rounded-xl border bg-gradient-panel p-5 transition-all",
                active
                  ? "border-primary/60 shadow-neon"
                  : "border-border/60 hover:border-primary/40 hover:shadow-neon",
              )}
            >
              <div
                className={cn(
                  "pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br blur-2xl opacity-60",
                  accentMap[agent.accent],
                )}
              />
              <div className="relative flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border/60 bg-background/50 font-display text-2xl">
                  {agent.emoji}
                </div>
                <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
                  {agent.category}
                </Badge>
              </div>
              <div className="relative mt-4">
                <h3 className="font-display text-lg font-semibold">{agent.name}</h3>
                <p className="font-mono text-xs text-muted-foreground">{agent.handle}</p>
              </div>
              <p className="relative mt-3 text-sm text-muted-foreground">{agent.description}</p>
              <p className="relative mt-2 font-mono text-[10px] text-muted-foreground/80">
                {agent.baseUrl}
              </p>

              <div className="relative mt-5 flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-1 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1">
                  <span className="font-mono text-sm font-bold text-primary">{agent.price}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-primary/70">
                    {t("marketplace.usdcPerRequest")}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={active ? "secondary" : "default"}
                  onClick={() => onSelect(agent)}
                  className={cn(
                    !active && "bg-gradient-neon text-neon-foreground hover:opacity-90",
                  )}
                >
                  {active ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> {t("marketplace.active")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" /> {t("marketplace.select")}
                    </>
                  )}
                </Button>
              </div>

              {active && (
                <Button
                  variant="link"
                  size="sm"
                  className="relative mt-2 h-auto p-0 text-xs text-primary"
                  onClick={() => navigate({ to: "/studio" })}
                >
                  {t("marketplace.openStudio")}
                </Button>
              )}
            </article>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border/60 bg-card/40 p-10 text-center text-sm text-muted-foreground">
            {t("marketplace.noResults", { query })}
          </div>
        )}
      </div>
    </div>
  );
}
