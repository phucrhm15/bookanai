import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/tanstack-react-start";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  BookOpen,
  Coins,
  Droplets,
  ExternalLink,
  Globe,
  Layers,
  Loader2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n/locale-context";
import {
  ARC_ECOSYSTEM_TOOLS,
  ARC_FAUCET_URL,
  ARC_NETWORK_FACTS,
  ARC_WALLET_CHAIN_PARAMS,
  arcExplorerAddressUrl,
} from "@/lib/arc-testnet-ecosystem";
import { UB_CHAIN_ARC } from "@/lib/chains";
import {
  fetchAppKitChains,
  fetchAppKitFunding,
  fetchAppKitMeta,
  postAppKitAction,
} from "@/lib/wallet-app-kit-api";
import { walletQueryKey } from "@/hooks/use-wallet";

type ArcTestnetToolsPanelProps = {
  walletAddress: string;
};

export function ArcTestnetToolsPanel({ walletAddress }: ArcTestnetToolsPanelProps) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const [bridgeAmount, setBridgeAmount] = useState("5");
  const [bridgeFrom, setBridgeFrom] = useState(UB_CHAIN_ARC);
  const [bridgeTo, setBridgeTo] = useState("");

  const [depositAmount, setDepositAmount] = useState("1");
  const [swapAmount, setSwapAmount] = useState("1");
  const [tokenIn, setTokenIn] = useState("USDC");
  const [tokenOut, setTokenOut] = useState("EURC");

  const fundingQuery = useQuery({
    queryKey: ["app-kit-funding"],
    queryFn: fetchAppKitFunding,
    refetchInterval: 30_000,
  });

  const metaQuery = useQuery({
    queryKey: ["app-kit-meta"],
    queryFn: fetchAppKitMeta,
  });

  const bridgeChainsQuery = useQuery({
    queryKey: ["app-kit-chains-bridge"],
    queryFn: () => fetchAppKitChains("bridge"),
  });

  const bridgeChains = bridgeChainsQuery.data ?? [];
  useEffect(() => {
    if (!bridgeTo && bridgeChains.length > 0) {
      const alt = bridgeChains.find((c) => c !== bridgeFrom);
      if (alt) setBridgeTo(alt);
    }
  }, [bridgeChains, bridgeFrom, bridgeTo]);

  const invalidateWallet = useCallback(() => {
    if (userId) {
      void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
    }
    void queryClient.invalidateQueries({ queryKey: ["app-kit-funding"] });
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
      toast.error(t("appKit.failed"), {
        description: err instanceof Error ? err.message : String(err),
        ...(code === "INSUFFICIENT_BALANCE" ? { duration: 10_000 } : {}),
      });
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = () => {
    if (!walletAddress) return;
    void navigator.clipboard.writeText(walletAddress);
    toast.success(t("wallet.copied"));
  };

  const openFaucet = () => {
    window.open(ARC_FAUCET_URL, "_blank", "noopener,noreferrer");
  };

  const addArcNetwork = async () => {
    const eth = (window as Window & { ethereum?: { request: (args: unknown) => Promise<unknown> } })
      .ethereum;
    if (!eth?.request) {
      toast.error(t("arcTools.noWalletExtension"));
      return;
    }
    try {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [ARC_WALLET_CHAIN_PARAMS],
      });
      toast.success(t("arcTools.networkAdded"));
    } catch (err) {
      toast.error(t("arcTools.networkAddFailed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const swapEnabled = metaQuery.data?.swapEnabled ?? false;
  const usdcOnArc = fundingQuery.data?.usdcOnArc ?? 0;

  return (
    <section className="mt-6 rounded-xl border border-lime-500/30 bg-gradient-panel p-5 shadow-[0_0_24px_-8px_rgba(132,204,22,0.25)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-lime-400" />
            <h2 className="font-display text-lg font-semibold">{t("arcTools.title")}</h2>
            <Badge
              variant="outline"
              className="border-lime-500/40 bg-lime-500/10 font-mono text-[9px] uppercase tracking-wider text-lime-400"
            >
              {t("arcTools.testnetBadge")}
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t("arcTools.subtitle")}</p>
        </div>
        <div className="rounded-md border border-border/50 bg-background/50 px-3 py-2 text-right text-xs">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("arcTools.arcBalance")}
          </div>
          {fundingQuery.isLoading ? (
            <Loader2 className="ml-auto mt-1 h-4 w-4 animate-spin" />
          ) : (
            <div className="font-mono text-sm font-semibold text-lime-400">
              {usdcOnArc.toFixed(4)} USDC
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-2 rounded-md border border-border/40 bg-background/40 px-3 py-2 font-mono text-[10px] text-muted-foreground sm:grid-cols-3">
        <span>
          Chain ID: <span className="text-foreground">{ARC_NETWORK_FACTS.chainId}</span>
        </span>
        <span>
          Gas: <span className="text-lime-400">{t("arcTools.usdcGas")}</span>
        </span>
        <span>
          CCTP: <span className="text-foreground">domain {ARC_NETWORK_FACTS.cctpDomain}</span>
        </span>
      </div>

      <Tabs defaultValue="faucet" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-background/60 md:grid-cols-4">
          <TabsTrigger value="faucet" className="gap-1 text-xs">
            <Droplets className="h-3 w-3" /> {t("arcTools.tabFaucet")}
          </TabsTrigger>
          <TabsTrigger value="bridge" className="gap-1 text-xs">
            <ArrowLeftRight className="h-3 w-3" /> {t("arcTools.tabBridge")}
          </TabsTrigger>
          <TabsTrigger value="swap" className="gap-1 text-xs">
            <Sparkles className="h-3 w-3" /> {t("arcTools.tabSwap")}
          </TabsTrigger>
          <TabsTrigger value="defi" className="gap-1 text-xs">
            <Layers className="h-3 w-3" /> {t("arcTools.tabDefi")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="faucet" className="mt-4 space-y-4">
          <p className="text-xs leading-relaxed text-muted-foreground">{t("arcTools.faucetHelp")}</p>
          <div className="flex flex-col gap-2 rounded-md border border-lime-500/25 bg-lime-500/5 p-3 sm:flex-row sm:items-center">
            <Wallet className="h-4 w-4 shrink-0 text-lime-400" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{walletAddress || "…"}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={copyAddress}>
                {t("wallet.copy")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => window.open(arcExplorerAddressUrl(walletAddress), "_blank")}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>{t("arcTools.faucetStep1")}</li>
            <li>{t("arcTools.faucetStep2")}</li>
            <li>{t("arcTools.faucetStep3")}</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-lime-500/90 text-black hover:bg-lime-400"
              onClick={openFaucet}
              disabled={!walletAddress}
            >
              <Droplets className="h-4 w-4" /> {t("arcTools.openFaucet")}
            </Button>
            <Button variant="outline" onClick={() => void addArcNetwork()}>
              {t("arcTools.addNetwork")}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="bridge" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">{t("arcTools.bridgeHelp")}</p>
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
          {usdcOnArc < Number(bridgeAmount) && bridgeFrom === UB_CHAIN_ARC ? (
            <p className="text-xs text-amber-500">{t("arcTools.needFaucetFirst")}</p>
          ) : null}
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
            {t("arcTools.runBridge")}
          </Button>

          <div className="border-t border-border/40 pt-3">
            <p className="mb-2 text-xs text-muted-foreground">{t("arcTools.depositHelp")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">{t("appKit.amount")}</Label>
                <Input
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="mt-1 font-mono"
                />
              </div>
            </div>
            <Button
              className="mt-3"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void runAction(
                  { action: "deposit", amount: depositAmount, chain: UB_CHAIN_ARC },
                  "appKit.depositOk",
                )
              }
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <Coins className="h-4 w-4" /> {t("arcTools.depositArc")}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="swap" className="mt-4 space-y-3">
          {!swapEnabled ? (
            <p className="text-xs text-muted-foreground">{t("appKit.swapNeedsKitKey")}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t("arcTools.swapHelp")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">{t("appKit.tokenIn")}</Label>
                  <Select value={tokenIn} onValueChange={setTokenIn}>
                    <SelectTrigger className="mt-1 font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USDC">USDC</SelectItem>
                      <SelectItem value="EURC">EURC</SelectItem>
                      <SelectItem value="USDT">USDT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("appKit.tokenOut")}</Label>
                  <Select value={tokenOut} onValueChange={setTokenOut}>
                    <SelectTrigger className="mt-1 font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EURC">EURC</SelectItem>
                      <SelectItem value="USDC">USDC</SelectItem>
                      <SelectItem value="USDT">USDT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">{t("appKit.amountIn")}</Label>
                  <Input
                    value={swapAmount}
                    onChange={(e) => setSwapAmount(e.target.value)}
                    className="mt-1 font-mono"
                  />
                </div>
              </div>
              <Button
                disabled={busy || tokenIn === tokenOut}
                onClick={() =>
                  void runAction(
                    {
                      action: "swap",
                      chain: UB_CHAIN_ARC,
                      tokenIn,
                      tokenOut,
                      amountIn: swapAmount,
                    },
                    "appKit.swapOk",
                  )
                }
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("arcTools.runSwap")}
              </Button>
            </>
          )}
        </TabsContent>

        <TabsContent value="defi" className="mt-4">
          <p className="mb-3 text-xs text-muted-foreground">{t("arcTools.defiHelp")}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {ARC_ECOSYSTEM_TOOLS.map((tool) => (
              <li key={tool.id}>
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full items-start gap-3 rounded-md border border-border/50 bg-background/40 p-3 transition hover:border-lime-500/40 hover:bg-lime-500/5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card">
                    {tool.category === "faucet" ? (
                      <Droplets className="h-4 w-4 text-lime-400" />
                    ) : tool.category === "explorer" ? (
                      <ExternalLink className="h-4 w-4 text-primary" />
                    ) : tool.category === "docs" ? (
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Layers className="h-4 w-4 text-magenta" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t(`arcTools.${tool.nameKey}`)}</div>
                    <div className="text-xs text-muted-foreground">
                      {t(`arcTools.${tool.descKey}`)}
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </section>
  );
}
