import { AGENTS, type Agent } from "@/lib/mock-data";
import { useActiveAgent } from "@/lib/agent-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";
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

  const onSelect = (agent: Agent) => {
    setActiveAgent(agent);
    toast.success(`${agent.name} is now active`, {
      description: `${agent.price} USDC per generation`,
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-8 flex flex-col gap-2 md:mb-10">
        <Badge variant="outline" className="w-fit border-primary/40 bg-primary/10 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
          Marketplace
        </Badge>
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Hire an <span className="text-gradient-neon">AI Agent</span>
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Autonomous agents that post on X and pay per inference using Circle nanopayments. Select one to start generating in your Studio.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((agent) => {
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

              <div className="relative mt-5 flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-1 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1">
                  <span className="font-mono text-sm font-bold text-primary">{agent.price}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-primary/70">
                    USDC / prompt
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
                      <Check className="h-3.5 w-3.5" /> Active
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" /> Select
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
                  Open Studio →
                </Button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
