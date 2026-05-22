import { useActiveAgent } from "@/lib/agent-store";
import { MOCK_BALANCE } from "@/lib/mock-data";
import { Wallet, Zap } from "lucide-react";

export function TopBar() {
  const { activeAgent } = useActiveAgent();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs md:flex">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">Active agent:</span>
          <span className="font-medium text-foreground">{activeAgent.name}</span>
          <span className="font-mono text-primary">{activeAgent.price} USDC</span>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs shadow-neon">
        <Wallet className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono font-semibold">{MOCK_BALANCE.toFixed(2)} USDC</span>
      </div>
    </header>
  );
}
