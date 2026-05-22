import { useState } from "react";
import { useActiveAgent } from "@/lib/agent-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { XPostPreview } from "@/components/x-post-preview";
import { toast } from "sonner";

type GenState = "idle" | "authorizing" | "generating" | "done";

const SAMPLE_OUTPUTS: Record<string, string> = {
  "alpha-caller-x":
    "Something is happening with $RWA narratives. Wallets that called $ONDO at $0.20 are rotating into 3 micro-caps this week. Not advice, just signal. 🧵",
  "meme-image-gen":
    "when the agent pays itself in USDC to shitpost about your bag 📈🤖",
  "rwa-thread-writer":
    "Tokenized treasuries crossed $2.1B AUM this quarter. Here's why the next leg is private credit — and the 3 protocols positioned to capture it. 🧵",
  "crypto-writer":
    "Daily recap → BTC chops at 67k, ETH/BTC bounces from 4y lows, Base TVL prints ATH. Solana memes cool off as attention rotates back to L2s.",
  "shitpost-9000":
    "respectfully, your portfolio is not bearish — it is just bad. gm.",
};

export function Studio() {
  const { activeAgent } = useActiveAgent();
  const [prompt, setPrompt] = useState(
    "Write a punchy X post about why nanopayments will unlock autonomous AI agents.",
  );
  const [state, setState] = useState<GenState>("idle");
  const [output, setOutput] = useState<string | null>(null);

  const run = async () => {
    if (!prompt.trim()) {
      toast.error("Add a prompt first");
      return;
    }
    setOutput(null);
    setState("authorizing");
    await new Promise((r) => setTimeout(r, 900));
    setState("generating");
    await new Promise((r) => setTimeout(r, 2100));
    setOutput(SAMPLE_OUTPUTS[activeAgent.id] ?? "Generated content goes here.");
    setState("done");
    toast.success(`Charged ${activeAgent.price} USDC`, {
      description: `Paid to ${activeAgent.name} via Circle Nanopayments`,
    });
  };

  const loading = state === "authorizing" || state === "generating";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-8">
        <Badge variant="outline" className="border-primary/40 bg-primary/10 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
          Studio
        </Badge>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">
          Generate <span className="text-gradient-neon">on-chain</span> content
        </h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Prompt panel */}
        <section className="lg:col-span-3">
          <div className="rounded-xl border border-border/60 bg-gradient-panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-background/60 font-display text-xl">
                  {activeAgent.emoji}
                </div>
                <div>
                  <div className="text-sm font-semibold">{activeAgent.name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {activeAgent.handle}
                  </div>
                </div>
              </div>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 font-mono text-xs text-primary">
                {activeAgent.price} USDC / prompt
              </Badge>
            </div>

            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the agent post about?"
              rows={7}
              className="resize-none border-border/60 bg-background/60 font-mono text-sm"
              disabled={loading}
            />

            <div className="mt-4 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="text-success">●</span> Powered by Circle Nanopayments
              </p>
              <Button
                size="lg"
                onClick={run}
                disabled={loading}
                className="bg-gradient-neon text-neon-foreground shadow-neon hover:opacity-90"
              >
                {state === "authorizing" && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Authorizing Nanopayment…
                  </>
                )}
                {state === "generating" && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </>
                )}
                {!loading && (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Generate Content · {activeAgent.price} USDC
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* status strip */}
          <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-wider">
            <StatusPill label="Authorize" active={state === "authorizing"} done={state === "generating" || state === "done"} />
            <StatusPill label="Generate" active={state === "generating"} done={state === "done"} />
            <StatusPill label="Deliver" active={false} done={state === "done"} />
          </div>
        </section>

        {/* Preview */}
        <section className="lg:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              X Preview
            </span>
          </div>
          <XPostPreview agent={activeAgent} content={output} loading={loading} />
        </section>
      </div>
    </div>
  );
}

function StatusPill({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div
      className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors ${
        done
          ? "border-success/40 bg-success/10 text-success"
          : active
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border/60 bg-card/40 text-muted-foreground"
      }`}
    >
      <span>{done ? "✓" : active ? "●" : "○"}</span>
      {label}
    </div>
  );
}
