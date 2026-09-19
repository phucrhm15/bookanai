import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/tanstack-react-start";
import { useActiveAgent } from "@/lib/agent-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Info, Loader2, Sparkles, Wand2 } from "lucide-react";
import { TweetThreadPreview } from "@/components/TweetThreadPreview";
import { BASE_CHAIN_ID, BASE_NETWORK, ARC_CHAIN_ID, ARC_NETWORK, ARC_MAINNET_CHAIN_ID, ARC_MAINNET_NETWORK } from "@/lib/chains";
import { postNanopayment } from "@/lib/wallet-api";
import {
  agentPromptMismatch,
  defaultPromptForAgent,
  getAgentStudioInput,
} from "@/lib/agent-prompt-hints";
import { agentRunsOnArcTestnet, agentRunsOnArcMainnet } from "@/lib/mock-data";
import { ARC_TESTNET_AGENT_IDS, ARC_MAINNET_AGENT_IDS } from "@/lib/arc-agent-network";
import { buildUniswapArcSwapUrl } from "@/lib/arc-testnet-ecosystem";
import { formatPaymentErrorForUser } from "@/lib/payment-error-messages";
import { translate } from "@/lib/i18n/translate";
import { useTranslation } from "@/lib/i18n/locale-context";
import { useWallet, walletQueryKey } from "@/hooks/use-wallet";

type GenState = "idle" | "authorizing" | "generating" | "done";
type StudioErrorState = { message: string; swapUrl?: string } | null;

export function Studio() {
  const { activeAgent } = useActiveAgent();
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const { data: wallet } = useWallet();
  const { t, locale } = useTranslation();

  const [prompt, setPrompt] = useState(() => defaultPromptForAgent(activeAgent.id, locale));
  const [state, setState] = useState<GenState>("idle");
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [lastError, setLastError] = useState<StudioErrorState>(null);
  const payInFlight = useRef(false);
  const swapWindowOpened = useRef(false);

  const studioInput = getAgentStudioInput(activeAgent.id, prompt, locale);
  const promptMismatch = agentPromptMismatch(activeAgent.id, prompt, locale);

  useEffect(() => {
    setPrompt(defaultPromptForAgent(activeAgent.id, locale));
    setRawResponse(null);
    setLastError(null);
    setState("idle");
  }, [activeAgent.id, locale]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !swapWindowOpened.current) return;
      swapWindowOpened.current = false;
      void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
      toast.success(t("studio.walletRefreshedAfterSwap"));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [queryClient, t, userId]);

  const extractRequiredAmount = (msg: string): number | undefined => {
    const match = msg.match(/Cần ([\d.]+)|Required[:\s]+([\d.]+)/i);
    const raw = match?.[1] ?? match?.[2];
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const inferSwapUrlFromError = (msg: string): string | undefined => {
    const direct = msg.match(/https:\/\/app\.uniswap\.org\/swap\?[^\s)]+/i)?.[0];
    if (direct) return direct;
    if (/Insufficient|Số dư không đủ|INSUFFICIENT_BALANCE|Content Credits/i.test(msg)) {
      const needed = extractRequiredAmount(msg) ?? activeAgent.price;
      return buildUniswapArcSwapUrl({
        tokenIn: "EURC",
        tokenOut: "USDC",
        amount: needed.toFixed(4),
      });
    }
    return undefined;
  };

  const openSwapThenRetry = (url: string) => {
    swapWindowOpened.current = true;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const run = async () => {
    if (studioInput.showPrompt && !prompt.trim()) {
      toast.error(t("studio.promptEmpty"));
      return;
    }
    const mismatch = agentPromptMismatch(activeAgent.id, prompt, locale);
    if (mismatch.warn && mismatch.message) {
      toast.warning(t("studio.promptMismatchTitle"), { description: mismatch.message });
    }
    if (payInFlight.current) {
      return;
    }
    payInFlight.current = true;
    setRawResponse(null);
    setLastError(null);
    setState("authorizing");

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pay-${Date.now()}`;

    const promptForApi = studioInput.showPrompt ? prompt.trim() : undefined;

    let payment: Awaited<ReturnType<typeof postNanopayment>> | undefined;
    try {
      if (!wallet?.walletId) {
        throw new Error(t("studio.walletNotLoaded"));
      }
      const prefersArcMainnet = agentRunsOnArcMainnet(activeAgent.id);
      const prefersArcTestnet = agentRunsOnArcTestnet(activeAgent.id);
      const chainId = prefersArcMainnet
        ? ARC_MAINNET_CHAIN_ID
        : prefersArcTestnet
          ? (wallet.networks?.arc?.id ?? ARC_CHAIN_ID)
          : (wallet.preferredChainId ?? wallet.networks?.base?.id ?? BASE_CHAIN_ID);
      setState("generating");
      payment = await postNanopayment(
        wallet.walletId,
        activeAgent.id,
        chainId,
        promptForApi,
        idempotencyKey,
      );
      await queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
    } catch (err) {
      const raw =
        err instanceof Error && err.message.trim()
          ? err.message
          : t("studio.paymentFailedGeneric");
      const msg = formatNanopaymentError(raw, activeAgent.id, locale);
      setLastError({ message: msg, swapUrl: inferSwapUrlFromError(msg) });
      toast.error(t("studio.paymentFailed"), { description: msg });
      setState("idle");
      return;
    } finally {
      payInFlight.current = false;
    }

    const body =
      activeAgent.id === "crypto-research-b"
        ? payment?.generatedContent?.trim() || payment?.rawResponse?.trim()
        : payment?.rawResponse?.trim() || payment?.generatedContent?.trim();
    if (!body) {
      toast.error(t("studio.paymentNoData"));
      setState("idle");
      return;
    }

    setRawResponse(body);
    setState("done");
    const settlement = payment?.onChainSettlementTxId
      ? t("studio.settlementTx", { id: payment.onChainSettlementTxId.slice(0, 10) })
      : t("studio.settlementQueued");
    toast.success(t("studio.charged", { amount: payment?.chargedUsdc ?? activeAgent.price }), {
      description: payment
        ? t("studio.chargedDescLedger", {
            balance: payment.ledgerBalance.toFixed(4),
            settlement,
          })
            : `Paid via x402 on ${
                payment?.targetChainId === ARC_CHAIN_ID ? ARC_NETWORK.name : BASE_NETWORK.name
              }`,
    });
  };

  const loading = state === "authorizing" || state === "generating";
  const settlementNetwork =
    agentRunsOnArcMainnet(activeAgent.id) || ARC_MAINNET_AGENT_IDS.has(activeAgent.id)
      ? ARC_MAINNET_NETWORK.name
      : agentRunsOnArcTestnet(activeAgent.id) || ARC_TESTNET_AGENT_IDS.has(activeAgent.id)
        ? ARC_NETWORK.name
        : BASE_NETWORK.name;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-8">
        <Badge
          variant="outline"
          className="border-primary/40 bg-primary/10 font-mono text-[10px] uppercase tracking-[0.2em] text-primary"
        >
          {t("studio.badge")}
        </Badge>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">
          {t("studio.title")} <span className="text-gradient-neon">{t("studio.titleAccent")}</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {t("studio.subtitle", { baseUrl: activeAgent.baseUrl })}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
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
                    {activeAgent.handle} ·{" "}
                  {(activeAgent.baseUrl ?? "x402").replace("https://", "")}
                  </div>
                </div>
              </div>
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/10 font-mono text-xs text-primary"
              >
                {t("studio.x402Dynamic")}
              </Badge>
            </div>

            {studioInput.showPrompt ? (
              <div className="space-y-2">
                <label
                  htmlFor="studio-prompt"
                  className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  {t("studio.promptLabel")}
                </label>
                <Textarea
                  id="studio-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={7}
                  className="resize-none border-border/60 bg-background/60 font-mono text-sm"
                  disabled={loading}
                />
                {studioInput.promptHint ? (
                  <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    {studioInput.promptHint}
                  </p>
                ) : null}
                {promptMismatch.warn && promptMismatch.message ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    {promptMismatch.message}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-background/50 px-4 py-4">
                <div className="mb-2 flex items-center gap-2 text-primary">
                  <Info className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-semibold">{activeAgent.name}</span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {studioInput.agentNote ?? activeAgent.description}
                </p>
              </div>
            )}

            <div className="mt-4 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="text-success">●</span>{" "}
                {t("studio.footerLine", { network: settlementNetwork })}
              </p>
              {!wallet?.walletId && !loading ? (
                <p className="text-xs text-magenta sm:hidden">
                  {t("studio.walletNotLoaded")}
                </p>
              ) : null}
              <Button
                size="lg"
                onClick={run}
                disabled={loading || !wallet?.walletId}
                title={!wallet?.walletId ? t("studio.walletNotLoaded") : undefined}
                className="bg-gradient-neon text-neon-foreground shadow-neon hover:opacity-90 disabled:opacity-50"
              >
                {state === "authorizing" && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("studio.runAuthorizing")}
                  </>
                )}
                {state === "generating" && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("studio.runFetching")}
                  </>
                )}
                {!loading && (
                  <>
                    <Wand2 className="h-4 w-4" />
                    {t("studio.runIdle")}
                  </>
                )}
              </Button>
            </div>
            {lastError ? (
              <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <p className="text-xs text-amber-200">{lastError.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {lastError.swapUrl ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (lastError.swapUrl) openSwapThenRetry(lastError.swapUrl);
                      }}
                    >
                      {t("studio.swapThenRetry")}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={run} disabled={loading || !wallet?.walletId}>
                    {t("studio.retryRun")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-wider">
            <StatusPill
              label={t("studio.statusAuthorize")}
              active={state === "authorizing"}
              done={state === "generating" || state === "done"}
            />
            <StatusPill
              label={t("studio.statusFetch")}
              active={state === "generating"}
              done={state === "done"}
            />
            <StatusPill label={t("studio.statusFormat")} active={false} done={state === "done"} />
          </div>
        </section>

        <section className="lg:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {t("thread.previewTitle")}
            </span>
          </div>
          <TweetThreadPreview
            agentId={activeAgent.id}
            authorName={activeAgent.name}
            authorHandle={activeAgent.handle}
            avatarEmoji={activeAgent.emoji}
            rawResponse={rawResponse}
            loading={loading}
          />
        </section>
      </div>
    </div>
  );
}

function formatNanopaymentError(
  message: string,
  agentId: string,
  locale: import("@/lib/i18n/types").Locale,
): string {
  let formatted: string;
  if (message.includes("Payment settlement failed") && agentId === "perplexity-social") {
    formatted = formatPaymentErrorForUser(
      `${message} · Admin: npm run gateway:status (Gateway ≥ 0.012 USDC)`,
      locale,
    );
  } else {
    formatted = formatPaymentErrorForUser(message, locale);
  }

  const noRefund =
    /INSUFFICIENT_BALANCE|Số dư không đủ|Insufficient Content Credits|DUPLICATE_PAYMENT/i.test(
      message,
    );
  if (!noRefund) {
    formatted += ` ${translate(locale, "studio.creditsRefundedHint")}`;
  }
  return formatted;
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
