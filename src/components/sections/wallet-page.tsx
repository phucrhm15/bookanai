import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ARC_NETWORK, BASE_NETWORK, TRANSACTIONS } from "@/lib/mock-data";
import { DEMO_USER_ID, fetchWallet } from "@/lib/wallet-api";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  Shield,
  Smartphone,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

export function WalletPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["wallet", DEMO_USER_ID],
    queryFn: () => fetchWallet(DEMO_USER_ID),
    staleTime: 30_000,
  });

  const address = data?.address ?? "";
  const balance = data?.unifiedBalance?.totalUsdc ?? data?.ledgerBalance ?? 0;
  const chainBreakdown = data?.unifiedBalance?.breakdown ?? [];
  const baseNetwork = data?.networks?.base ?? BASE_NETWORK;
  const arcNetwork = data?.networks?.arc ?? ARC_NETWORK;
  const usdcContract = arcNetwork.usdcContractAddress ?? data?.usdcContractAddress ?? "0x3600000000000000000000000000000000000000";
  const shortAddress = address
    ? `${address.slice(0, 5)}…${address.slice(-3)}`
    : "…";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-8">
        <Badge variant="outline" className="border-primary/40 bg-primary/10 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
          Wallet & Billing
        </Badge>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">
          Your <span className="text-gradient-neon">Account Balance</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Content credits for your AI agents. No seed phrases, no popups — just top up and create.
        </p>
      </header>

      {isError && (
        <p className="mb-4 rounded-md border border-magenta/40 bg-magenta/10 px-3 py-2 text-sm text-magenta">
          {error instanceof Error ? error.message : "Could not load wallet"}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <BalanceCard
          isLoading={isLoading}
          balance={balance}
          address={address}
          shortAddress={shortAddress}
          usdcContract={usdcContract}
          chainBreakdown={chainBreakdown}
          baseNetwork={baseNetwork}
          arcNetwork={arcNetwork}
        />
        <TransactionHistory
          transactions={data?.transactions?.length ? data.transactions : TRANSACTIONS}
        />
      </div>
    </div>
  );
}

function BalanceCard({
  isLoading,
  balance,
  address,
  shortAddress,
  usdcContract,
  chainBreakdown,
  baseNetwork,
  arcNetwork,
}: {
  isLoading: boolean;
  balance: number;
  address: string;
  shortAddress: string;
  usdcContract: string;
  chainBreakdown: { chain: string; chainId: number; confirmedBalance: string }[];
  baseNetwork: { name: string; id: number; usdcContractAddress: string };
  arcNetwork: { name: string; id: number; usdcContractAddress: string };
}) {
  return (
    <section className="lg:col-span-2 space-y-4">
      <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-panel p-6 shadow-neon">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-magenta/20 blur-3xl" />

        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Content Credits
            </span>
            <Badge variant="outline" className="gap-1 border-success/40 bg-success/10 font-mono text-[10px] text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Unified · Base + Arc
            </Badge>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            {isLoading ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : (
              <>
                <span className="font-display text-5xl font-bold tracking-tight">
                  ${balance.toFixed(2)}
                </span>
                <span className="font-mono text-sm text-primary">USDC</span>
              </>
            )}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            1 USDC = $1 USD · Circle Gateway unified balance
          </div>

          {chainBreakdown.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-xs">
              {chainBreakdown.map((row) => (
                <li key={row.chain} className="flex justify-between font-mono text-muted-foreground">
                  <span>{row.chain}</span>
                  <span className="text-foreground">{row.confirmedBalance} USDC</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2">
            <Shield className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate font-mono text-xs text-muted-foreground">
              {address || "Loading wallet…"}
            </span>
            {address ? <CopyButton value={address} /> : null}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <TopUpDialog
              address={address}
              shortAddress={shortAddress}
              usdcContract={usdcContract}
              baseNetwork={baseNetwork}
              arcNetwork={arcNetwork}
              disabled={!address}
            />
            <Button variant="outline" className="border-border/60">
              <ArrowUpRight className="h-4 w-4" /> Withdraw
            </Button>
          </div>

          <div className="mt-6 flex items-center gap-2 border-t border-border/60 pt-4">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Powered by <span className="text-primary">Circle Programmable Wallets</span>
            </span>
          </div>
        </div>
      </div>

      <RecentActivity />
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
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
      aria-label="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

type PendingDeposit =
  | { status: "idle" }
  | { status: "pending"; amount: number }
  | { status: "confirmed"; amount: number; latencyMs: number };

function RecentActivity() {
  const [deposit, setDeposit] = useState<PendingDeposit>({ status: "idle" });

  const simulate = () => {
    const amount = 10;
    setDeposit({ status: "pending", amount });
    setTimeout(() => {
      setDeposit({ status: "confirmed", amount, latencyMs: 800 });
    }, 3000);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-semibold">Recent Activity</h3>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Live · Arc Ledger
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-border/60 font-mono text-[10px] uppercase tracking-wider"
          onClick={simulate}
          disabled={deposit.status === "pending"}
        >
          Simulate Deposit
        </Button>
      </div>

      {deposit.status === "idle" && (
        <p className="rounded-md border border-dashed border-border/60 bg-background/40 p-4 text-center text-xs text-muted-foreground">
          No pending deposits. New activity will appear here in real time.
        </p>
      )}

      {deposit.status === "pending" && (
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">
              ⏱️ Receiving {deposit.amount.toFixed(2)} USDC…
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              Awaiting confirmation on {ARC_NETWORK.name}
            </div>
          </div>
        </div>
      )}

      {deposit.status === "confirmed" && (
        <div className="flex items-center gap-3 rounded-md border border-success/40 bg-success/10 p-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-success">
              ✅ Successfully Credited · +{deposit.amount.toFixed(2)} USDC
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              Confirmed on Arc Ledger in {(deposit.latencyMs / 1000).toFixed(1)}s
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TopUpDialog({
  address,
  shortAddress,
  usdcContract,
  baseNetwork,
  arcNetwork,
  disabled,
}: {
  address: string;
  shortAddress: string;
  usdcContract: string;
  baseNetwork: { name: string; id: number; usdcContractAddress: string; depositWarning?: string };
  arcNetwork: { name: string; id: number; usdcContractAddress: string; depositWarning?: string };
  disabled: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          disabled={disabled}
          className="bg-gradient-neon text-neon-foreground hover:opacity-90"
        >
          <ArrowDownLeft className="h-4 w-4" /> Top Up
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg border-primary/30 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-display">Top Up Your Account</DialogTitle>
          <DialogDescription>
            One wallet address — deposit on Base or Arc Testnet. Circle Unified Balance aggregates your USDC.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="crypto" className="mt-2">
          <TabsList className="grid w-full grid-cols-2 bg-background/60">
            <TabsTrigger value="crypto" className="gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <Wallet className="h-3.5 w-3.5" /> Crypto Deposit
            </TabsTrigger>
            <TabsTrigger value="fiat" className="gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <CreditCard className="h-3.5 w-3.5" /> Fiat / Card
            </TabsTrigger>
          </TabsList>

          <TabsContent value="crypto" className="mt-4 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-xl border border-primary/30 bg-background p-4 shadow-neon">
                <FakeQR />
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Your Circle Embedded Wallet (same address on both chains)
              </div>
              <div className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2">
                <span className="truncate font-mono text-xs">{address || shortAddress}</span>
                {address ? <CopyButton value={address} /> : null}
              </div>
            </div>

            <Tabs defaultValue="base" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-background/60">
                <TabsTrigger value="base" className="font-mono text-[10px] uppercase tracking-wider data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                  {baseNetwork.name}
                </TabsTrigger>
                <TabsTrigger value="arc" className="font-mono text-[10px] uppercase tracking-wider data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                  {arcNetwork.name}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="base" className="mt-3 space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-magenta/40 bg-magenta/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-magenta" />
                  <p className="text-xs leading-relaxed text-foreground">
                    <span className="font-bold uppercase tracking-wider text-magenta">Base only:</span>{" "}
                    Send <span className="font-semibold">USDC on Base mainnet (chain {baseNetwork.id})</span> only.
                    Other tokens or networks will cause permanent loss of funds.
                  </p>
                </div>
                <DepositContractRow
                  label={`USDC on ${baseNetwork.name}`}
                  contract={baseNetwork.usdcContractAddress}
                />
              </TabsContent>

              <TabsContent value="arc" className="mt-3 space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-magenta/40 bg-magenta/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-magenta" />
                  <p className="text-xs leading-relaxed text-foreground">
                    <span className="font-bold uppercase tracking-wider text-magenta">Arc only:</span>{" "}
                    Send <span className="font-semibold">USDC on Arc Testnet (chain {arcNetwork.id})</span> only.
                    Use the contract address below — not Ethereum or other L2 USDC.
                  </p>
                </div>
                <DepositContractRow
                  label={`USDC on ${arcNetwork.name}`}
                  contract={arcNetwork.usdcContractAddress ?? usdcContract}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="fiat" className="mt-4 space-y-3">
            <button
              type="button"
              disabled
              className="flex w-full items-center gap-3 rounded-md border border-border/60 bg-background/60 p-4 text-left opacity-70 transition hover:border-primary/40"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-card">
                <CreditCard className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">Pay with Credit Card</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  via Stripe
                </div>
              </div>
              <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-wider">Soon</Badge>
            </button>

            <button
              type="button"
              disabled
              className="flex w-full items-center gap-3 rounded-md border border-border/60 bg-background/60 p-4 text-left opacity-70 transition hover:border-primary/40"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-card">
                <Smartphone className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">Apple Pay</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  One-tap top up
                </div>
              </div>
              <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-wider">Soon</Badge>
            </button>

            <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Coming soon on Mainnet.</span>{" "}
              This will automatically buy USDC and fund your AI Agent under the hood — no wallet needed.
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function DepositContractRow({ label, contract }: { label: string; contract: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label} — contract address
      </div>
      <div className="mt-1 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
        <span className="truncate font-mono text-xs text-primary">{contract}</span>
        <CopyButton value={contract} />
      </div>
    </div>
  );
}

function FakeQR() {
  const size = 21;
  const cells = Array.from({ length: size * size }, (_, i) => {
    const x = i % size;
    const y = Math.floor(i / size);
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

function TransactionHistory({
  transactions,
}: {
  transactions: {
    id: string;
    label: string;
    amount: number;
    timestamp: string;
    kind?: string;
  }[];
}) {
  return (
    <section className="lg:col-span-3">
      <div className="rounded-xl border border-border/60 bg-gradient-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Transaction History</h2>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              x402 Nanopayments · Arc Network
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            {transactions.length} entries
          </Badge>
        </div>

        <ul className="divide-y divide-border/50">
          {transactions.map((tx) => {
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
                  <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                    <span>{tx.timestamp}</span>
                    {tx.kind === "nanopayment" && (
                      <span className="rounded-sm border border-primary/30 bg-primary/5 px-1 py-px text-[9px] uppercase tracking-wider text-primary">
                        x402
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className={`font-mono text-sm font-semibold ${
                    positive ? "text-success" : "text-foreground"
                  }`}
                >
                  {positive ? "+" : ""}
                  {tx.amount.toFixed(3)} <span className="text-muted-foreground">USDC</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
