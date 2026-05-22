import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MOCK_BALANCE, MOCK_WALLET_ADDRESS, TRANSACTIONS } from "@/lib/mock-data";
import { ArrowDownLeft, ArrowUpRight, Check, Copy, Shield, Zap } from "lucide-react";
import { toast } from "sonner";

export function WalletPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-8">
        <Badge variant="outline" className="border-primary/40 bg-primary/10 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
          Wallet & Billing
        </Badge>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">
          Agent <span className="text-gradient-neon">Embedded Wallet</span>
        </h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        <WalletCard />
        <TransactionHistory />
      </div>
    </div>
  );
}

function WalletCard() {
  return (
    <section className="lg:col-span-2">
      <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-panel p-6 shadow-neon">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-magenta/20 blur-3xl" />

        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              USDC Balance
            </span>
            <Badge variant="outline" className="gap-1 border-success/40 bg-success/10 font-mono text-[10px] text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Active
            </Badge>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-5xl font-bold tracking-tight">
              {MOCK_BALANCE.toFixed(2)}
            </span>
            <span className="font-mono text-sm text-primary">USDC</span>
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            ≈ ${MOCK_BALANCE.toFixed(2)} USD · Polygon
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2">
            <Shield className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate font-mono text-xs text-muted-foreground">
              {MOCK_WALLET_ADDRESS}
            </span>
            <CopyButton value={MOCK_WALLET_ADDRESS} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <DepositDialog />
            <Button variant="outline" className="border-border/60">
              <ArrowUpRight className="h-4 w-4" /> Withdraw
            </Button>
          </div>

          <div className="mt-6 flex items-center gap-2 border-t border-border/60 pt-4">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Powered by <span className="text-primary">Circle Nanopayments</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success("Address copied");
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
      aria-label="Copy address"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function DepositDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="bg-gradient-neon text-neon-foreground hover:opacity-90">
          <ArrowDownLeft className="h-4 w-4" /> Deposit
        </Button>
      </DialogTrigger>
      <DialogContent className="border-primary/30 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-display">Deposit USDC</DialogTitle>
          <DialogDescription>
            Send USDC (Polygon) to your embedded agent wallet. Funds appear within seconds.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div className="rounded-xl border border-primary/30 bg-background p-4 shadow-neon">
            <FakeQR />
          </div>
          <div className="w-full">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Wallet Address
            </div>
            <div className="mt-1 flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2">
              <span className="truncate font-mono text-xs">{MOCK_WALLET_ADDRESS}</span>
              <CopyButton value={MOCK_WALLET_ADDRESS} />
            </div>
          </div>
          <div className="w-full rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            Only send <span className="font-semibold text-foreground">USDC on Polygon</span>. Other assets will be lost.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FakeQR() {
  // deterministic pseudo-random QR pattern
  const size = 21;
  const cells = Array.from({ length: size * size }, (_, i) => {
    const x = i % size;
    const y = Math.floor(i / size);
    // corners (finder patterns)
    const inCorner =
      (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
    if (inCorner) {
      const lx = x >= size - 7 ? x - (size - 7) : x;
      const ly = y >= size - 7 ? y - (size - 7) : y;
      const ring = lx === 0 || lx === 6 || ly === 0 || ly === 6;
      const center = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
      return ring || center;
    }
    return ((x * 31 + y * 17 + x * y) % 3) === 0;
  });
  return (
    <div
      className="grid gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${size}, 8px)` }}
    >
      {cells.map((on, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-[1px] ${on ? "bg-foreground" : "bg-transparent"}`}
        />
      ))}
    </div>
  );
}

function TransactionHistory() {
  return (
    <section className="lg:col-span-3">
      <div className="rounded-xl border border-border/60 bg-gradient-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Transaction History</h2>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              On-chain · Circle USDC
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            {TRANSACTIONS.length} entries
          </Badge>
        </div>

        <ul className="divide-y divide-border/50">
          {TRANSACTIONS.map((tx) => {
            const positive = tx.amount > 0;
            return (
              <li key={tx.id} className="flex items-center gap-3 py-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-md border ${
                    positive
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-primary/30 bg-primary/10 text-primary"
                  }`}
                >
                  {positive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{tx.label}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{tx.timestamp}</div>
                </div>
                <div
                  className={`font-mono text-sm font-semibold ${
                    positive ? "text-success" : "text-foreground"
                  }`}
                >
                  {positive ? "+" : ""}
                  {tx.amount.toFixed(2)} <span className="text-muted-foreground">USDC</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
