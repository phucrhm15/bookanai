import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeftRight, Coins, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/locale-context";
import {
  fetchAppKitBalances,
  fetchAppKitChains,
  fetchAppKitFunding,
  fetchAppKitMeta,
  postAppKitAction,
} from "@/lib/wallet-app-kit-api";
import { walletQueryKey } from "@/hooks/use-wallet";
import { useAuth } from "@clerk/tanstack-react-start";

type WalletAppKitPanelProps = {
  walletAddress: string;
  defaultChain: string;
};

export function WalletAppKitPanel({ walletAddress, defaultChain }: WalletAppKitPanelProps) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const [depositAmount, setDepositAmount] = useState("0.05");
  const [depositChain, setDepositChain] = useState(defaultChain);

  const [bridgeAmount, setBridgeAmount] = useState("1");
  const [bridgeFrom, setBridgeFrom] = useState(defaultChain);
  const [bridgeTo, setBridgeTo] = useState("");

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");

  const [swapAmount, setSwapAmount] = useState("10");
  const [swapChain, setSwapChain] = useState(defaultChain);
  const [tokenIn, setTokenIn] = useState("USDC");
  const [tokenOut, setTokenOut] = useState("USDT");

  const metaQuery = useQuery({
    queryKey: ["app-kit-meta"],
    queryFn: fetchAppKitMeta,
  });

  const balancesQuery = useQuery({
    queryKey: ["app-kit-balances"],
    queryFn: fetchAppKitBalances,
    refetchInterval: 30_000,
  });

  const fundingQuery = useQuery({
    queryKey: ["app-kit-funding"],
    queryFn: fetchAppKitFunding,
    refetchInterval: 30_000,
  });

  const bridgeChainsQuery = useQuery({
    queryKey: ["app-kit-chains-bridge"],
    queryFn: () => fetchAppKitChains("bridge"),
  });

  const bridgeChains = bridgeChainsQuery.data ?? [];
  useEffect(() => {
    if (!bridgeTo && bridgeChains.length > 1) {
      const alt = bridgeChains.find((c) => c !== bridgeFrom);
      if (alt) setBridgeTo(alt);
    }
  }, [bridgeChains, bridgeFrom, bridgeTo]);

  const invalidateWallet = useCallback(() => {
    if (userId) {
      void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
    }
    void queryClient.invalidateQueries({ queryKey: ["app-kit-balances"] });
  }, [queryClient, userId]);

  const runAction = async (body: Record<string, string>, successKey: string) => {
    setBusy(true);
    try {
      const result = await postAppKitAction(body);
      toast.success(t(successKey), {
        description: result.txHash
          ? `${t("appKit.tx")}: ${result.txHash.slice(0, 14)}…`
          : result.state,
      });
      invalidateWallet();
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      const description = err instanceof Error ? err.message : String(err);
      if (code === "NEEDS_ETH_GAS") {
        toast.error(t("appKit.gasRequiredTitle"), {
          description: t("appKit.gasRequiredDesc", {
            address: walletAddress,
            eth: fundingQuery.data?.ethOnBase.toFixed(6) ?? "0",
            recommended: String(fundingQuery.data?.recommendedEth ?? 0.001),
          }),
          duration: 12_000,
        });
      } else if (code === "INSUFFICIENT_BALANCE") {
        toast.error(t("appKit.insufficientUsdcTitle"), { description });
      } else {
        toast.error(t("appKit.failed"), { description });
      }
    } finally {
      setBusy(false);
    }
  };

  const swapEnabled = metaQuery.data?.swapEnabled ?? false;

  return (
    <section className="rounded-xl border border-primary/25 bg-gradient-panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">{t("appKit.title")}</h2>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t("appKit.subtitle")}</p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
          @circle-fin/app-kit
        </Badge>
      </div>

      <div className="mb-4 rounded-md border border-border/50 bg-background/50 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">{t("appKit.gatewayBalance")}</span>
          {balancesQuery.isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span className="font-mono font-semibold text-foreground">
              {balancesQuery.data?.totalFormatted ?? "0"} USDC
            </span>
          )}
        </div>
        {(balancesQuery.data?.perChain?.length ?? 0) > 0 && (
          <ul className="mt-2 space-y-0.5 font-mono text-[10px] text-muted-foreground">
            {balancesQuery.data?.perChain.map((row) => (
              <li key={row.chain} className="flex justify-between">
                <span>{row.chain}</span>
                <span>{row.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Tabs defaultValue="deposit" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-background/60 md:grid-cols-4">
          <TabsTrigger value="deposit" className="gap-1 text-xs">
            <Coins className="h-3 w-3" /> {t("appKit.tabDeposit")}
          </TabsTrigger>
          <TabsTrigger value="bridge" className="gap-1 text-xs">
            <ArrowLeftRight className="h-3 w-3" /> {t("appKit.tabBridge")}
          </TabsTrigger>
          <TabsTrigger value="withdraw" className="gap-1 text-xs">
            <Send className="h-3 w-3" /> {t("appKit.tabWithdraw")}
          </TabsTrigger>
          <TabsTrigger value="swap" className="gap-1 text-xs" disabled={!swapEnabled}>
            <Sparkles className="h-3 w-3" /> {t("appKit.tabSwap")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deposit" className="mt-4 space-y-3">
          {fundingQuery.data && !fundingQuery.data.ethSufficient && depositChain === "Base" ? (
            <div className="flex gap-2 rounded-md border border-magenta/40 bg-magenta/10 p-3 text-xs leading-relaxed">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-magenta" />
              <div>
                <p className="font-semibold text-magenta">{t("appKit.gasRequiredTitle")}</p>
                <p className="mt-1 text-foreground">{t("appKit.gasRequiredDesc", {
                  address: walletAddress,
                  eth: fundingQuery.data.ethOnBase.toFixed(6),
                  recommended: String(fundingQuery.data.recommendedEth),
                })}</p>
                <p className="mt-2 font-mono text-[10px] text-muted-foreground break-all">
                  {walletAddress}
                </p>
              </div>
            </div>
          ) : null}
          {fundingQuery.data && depositAmount && Number(depositAmount) > fundingQuery.data.usdcOnBase + 0.000001 ? (
            <p className="text-xs text-magenta">
              {t("appKit.insufficientUsdcInline", {
                have: fundingQuery.data.usdcOnBase.toFixed(4),
                want: depositAmount,
              })}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("appKit.depositHelp")}</p>
          {fundingQuery.data ? (
            <p className="font-mono text-[10px] text-muted-foreground">
              {t("appKit.onChainHint", {
                usdc: fundingQuery.data.usdcOnBase.toFixed(4),
                eth: fundingQuery.data.ethOnBase.toFixed(6),
              })}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{t("appKit.amount")}</Label>
              <Input
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">{t("appKit.chain")}</Label>
              <Select value={depositChain} onValueChange={setDepositChain}>
                <SelectTrigger className="mt-1 font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(metaQuery.data?.paymentChains ?? []).map((c) => (
                    <SelectItem key={c.appKitChain} value={c.appKitChain}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            disabled={busy || !walletAddress}
            onClick={() =>
              void runAction(
                { action: "deposit", amount: depositAmount, chain: depositChain },
                "appKit.depositOk",
              )
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("appKit.runDeposit")}
          </Button>
        </TabsContent>

        <TabsContent value="bridge" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">{t("appKit.bridgeHelp")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">{t("appKit.amount")}</Label>
              <Input
                value={bridgeAmount}
                onChange={(e) => setBridgeAmount(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">{t("appKit.fromChain")}</Label>
              <Select value={bridgeFrom} onValueChange={setBridgeFrom}>
                <SelectTrigger className="mt-1 font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bridgeChains.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("appKit.toChain")}</Label>
              <Select value={bridgeTo} onValueChange={setBridgeTo}>
                <SelectTrigger className="mt-1 font-mono text-xs">
                  <SelectValue placeholder="…" />
                </SelectTrigger>
                <SelectContent>
                  {bridgeChains.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            disabled={busy || !bridgeTo || bridgeFrom === bridgeTo}
            onClick={() =>
              void runAction(
                {
                  action: "bridge",
                  amount: bridgeAmount,
                  fromChain: bridgeFrom,
                  toChain: bridgeTo,
                },
                "appKit.bridgeOk",
              )
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("appKit.runBridge")}
          </Button>
        </TabsContent>

        <TabsContent value="withdraw" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">{t("appKit.withdrawHelp")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{t("appKit.amount")}</Label>
              <Input
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="mt-1 font-mono"
                placeholder="0.10"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">{t("appKit.recipient")}</Label>
              <Input
                value={withdrawTo}
                onChange={(e) => setWithdrawTo(e.target.value)}
                className="mt-1 font-mono text-xs"
                placeholder="0x…"
              />
            </div>
          </div>
          <Button
            disabled={busy || !withdrawTo.startsWith("0x")}
            onClick={() =>
              void runAction(
                {
                  action: "withdraw",
                  amount: withdrawAmount,
                  recipientAddress: withdrawTo,
                  fromChain: defaultChain,
                },
                "appKit.withdrawOk",
              )
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("appKit.runWithdraw")}
          </Button>
        </TabsContent>

        <TabsContent value="swap" className="mt-4 space-y-3">
          {!swapEnabled ? (
            <p className="text-xs text-muted-foreground">{t("appKit.swapNeedsKitKey")}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t("appKit.swapHelp")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">{t("appKit.tokenIn")}</Label>
                  <Input
                    value={tokenIn}
                    onChange={(e) => setTokenIn(e.target.value)}
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("appKit.tokenOut")}</Label>
                  <Input
                    value={tokenOut}
                    onChange={(e) => setTokenOut(e.target.value)}
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("appKit.amountIn")}</Label>
                  <Input
                    value={swapAmount}
                    onChange={(e) => setSwapAmount(e.target.value)}
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("appKit.chain")}</Label>
                  <Select value={swapChain} onValueChange={setSwapChain}>
                    <SelectTrigger className="mt-1 font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(metaQuery.data?.paymentChains ?? []).map((c) => (
                        <SelectItem key={c.appKitChain} value={c.appKitChain}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                disabled={busy}
                onClick={() =>
                  void runAction(
                    {
                      action: "swap",
                      chain: swapChain,
                      tokenIn,
                      tokenOut,
                      amountIn: swapAmount,
                    },
                    "appKit.swapOk",
                  )
                }
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("appKit.runSwap")}
              </Button>
            </>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
