/**
 * Stack B — alt-coin research workflow (~$0.22 / run):
 *   1. Exa web search
 *   2. Messari asset details (slugs from prompt + Exa)
 *   3. vaults.fyi networks + vaults
 *   4. Gloria news-ticker-summary × 3 tickers
 */
import { isSupportedChainId, type SupportedChainId } from "@/lib/chains";
import { ledgerLabelRefundX402, ledgerLabelX402 } from "@/server/ledger-label-keys";
import {
  circleRuntimeReady,
  ensureClerkUserWalletSynced,
  getUnifiedBalance,
  settleWithMasterAgentBounded,
  type NanopaymentResult,
} from "@/services/circleService";
import { CircleServiceError } from "@/services/circle-errors";
import {
  cancelOnchainSettlementForLedgerEntry,
  syncWalletCreditsForUser,
} from "@/server/services/onchain-settlement";
import { collectUserUsdcForX402 } from "@/server/services/user-x402-prefund";
import { userStore, UserStoreError } from "@/server/storage/user-store";
import {
  formatStackBForDisplay,
  type StackBReport,
  type StackBStepResult,
} from "@/lib/stack-b-format";

const INSUFFICIENT_MSG = "Số dư không đủ để thanh toán cho Agent này";
export const RESEARCH_STACK_B_AGENT_ID = "crypto-research-b";
export const RESEARCH_STACK_B_ROUTE_BUDGET_MS = 120_000;

const EXA_URL = "https://api.exa.ai/search";
const MESSARI_DETAILS_URL = "https://api.messari.io/metrics/v2/assets/details";
const VAULTS_NETWORKS_URL = "https://api.vaults.fyi/v2/networks";
const VAULTS_VAULTS_URL = "https://api.vaults.fyi/v2/vaults";
const GLORIA_TICKER_URL = "https://api.itsgloria.ai/news-ticker-summary";

/** Per-step fallback when live probe is skipped (sum ≈ 0.218 USDC). */
const STEP_PRICES = {
  exa: 0.007,
  messari: 0.1,
  vaultsNetworks: 0.005,
  vaultsVaults: 0.005,
  gloria: 0.031,
} as const;

import {
  buildStackBExaQuery,
  extractAltTickersFromText,
  extractMessariSymbols,
  filterAltSlugs,
  gloriaTickersForStackB,
  messariSlugsForStackB,
  TICKER_TO_SLUG,
} from "@/lib/stack-b-exclusions";

function assertUsable(data: unknown, bodyText: string, step: string): void {
  if (!bodyText.trim()) {
    throw new CircleServiceError(
      `Stack B — ${step} trả phản hồi rỗng sau thanh toán x402`,
      "SETTLEMENT_FAILED",
    );
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if (obj.error != null && obj.error !== "") {
      const detail =
        typeof obj.error === "string"
          ? obj.error
          : JSON.stringify(obj.error).slice(0, 200);
      throw new CircleServiceError(
        `Stack B — ${step} lỗi API: ${detail}`,
        "SETTLEMENT_FAILED",
      );
    }
  }
}

type StepKey = keyof typeof STEP_PRICES;

function extractFromExaData(data: unknown): { tickers: string[]; slugs: string[] } {
  const textParts: string[] = [];
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const results = root?.results;
  if (Array.isArray(results)) {
    for (const item of results) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      for (const key of ["title", "text", "url"]) {
        if (typeof row[key] === "string") textParts.push(row[key] as string);
      }
      if (Array.isArray(row.highlights)) {
        textParts.push(row.highlights.map(String).join(" "));
      }
    }
  }
  const tickers = extractAltTickersFromText(textParts.join("\n"));
  const slugs = filterAltSlugs(
    tickers.map((t) => TICKER_TO_SLUG[t]).filter((s): s is string => Boolean(s)),
  );
  return { tickers, slugs };
}

function stepPrice(step: StepKey): number {
  return STEP_PRICES[step];
}

function stackTotalUsdc(): number {
  return (
    STEP_PRICES.exa +
    STEP_PRICES.messari +
    STEP_PRICES.vaultsNetworks +
    STEP_PRICES.vaultsVaults +
    STEP_PRICES.gloria * 3
  );
}

async function payStep(
  step: StepKey,
  resourceUrl: string,
  targetChainId: SupportedChainId,
  payOptions?: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: unknown },
): Promise<StackBStepResult> {
  const price = STEP_PRICES[step];
  const response = await settleWithMasterAgentBounded(
    resourceUrl,
    targetChainId,
    price,
    payOptions,
  );
  const httpStatus = response.status ?? 200;
  if (httpStatus >= 400) {
    throw new CircleServiceError(
      `Stack B — ${step} HTTP ${httpStatus}`,
      "SETTLEMENT_FAILED",
    );
  }
  const bodyText =
    typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data ?? {});
  assertUsable(response.data, bodyText, step);
  return { url: resourceUrl, status: httpStatus, data: response.data };
}

export async function processResearchStackB(
  clerkId: string,
  userWalletId: string,
  targetChainId: number,
  prompt?: string,
  idempotencyKey?: string,
): Promise<NanopaymentResult> {
  if (!circleRuntimeReady()) {
    throw new CircleServiceError(
      "Circle is not configured. Set env vars from .env.local.example.",
      "SETTLEMENT_FAILED",
    );
  }

  if (!isSupportedChainId(targetChainId)) {
    throw new CircleServiceError(
      `Unsupported targetChainId ${targetChainId}`,
      "UNSUPPORTED_CHAIN",
    );
  }

  const walletRow = userStore.getByWalletId(userWalletId);
  if (!walletRow || walletRow.userId !== clerkId) {
    throw new CircleServiceError(`Unknown user wallet id: ${userWalletId}`, "WALLET_NOT_FOUND");
  }

  await ensureClerkUserWalletSynced(clerkId);
  userStore.requireByClerkId(clerkId);

  const userPrompt =
    prompt?.trim() ||
    "Top mid-cap altcoins: narratives, TVL, token unlocks, DeFi rotation (exclude BTC ETH BNB XRP stables)";
  const totalUsdc = stackTotalUsdc();
  console.info(`[stack-b] Estimated total: ${totalUsdc} USDC`);

  const unified = await getUnifiedBalance(userWalletId);
  const credits = await syncWalletCreditsForUser(clerkId, unified.totalUsdc);
  const spendable = credits.spendableCreditsUsdc;

  if (spendable < totalUsdc) {
    throw new CircleServiceError(
      `${INSUFFICIENT_MSG}. Stack B cần ~${totalUsdc.toFixed(3)} USDC, khả dụng ${spendable.toFixed(6)} USDC.`,
      "INSUFFICIENT_BALANCE",
    );
  }

  let debited = false;
  let debitedAmount = 0;
  let actualSpentUsdc = 0;
  let ledgerEntryId: string | undefined;
  let onChainSettlementQueuedId: string | undefined;
  let userPrefunded = false;

  try {
    const debitResult = userStore.debit(clerkId, totalUsdc, {
      label: ledgerLabelX402(RESEARCH_STACK_B_AGENT_ID),
      agentId: RESEARCH_STACK_B_AGENT_ID,
      idempotencyKey,
    });
    const updated = debitResult.record;
    ledgerEntryId = debitResult.ledgerEntryId;
    debited = true;
    debitedAmount = totalUsdc;

    const prefund = await collectUserUsdcForX402({
      clerkId,
      userWalletId,
      ledgerEntryId,
      amountUsdc: totalUsdc,
      targetChainId: targetChainId as SupportedChainId,
    });
    userPrefunded = true;
    onChainSettlementQueuedId = prefund.settlementId;

    const exaQuery = buildStackBExaQuery(userPrompt);
    const exa = await payStep(
      "exa",
      EXA_URL,
      targetChainId as SupportedChainId,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: {
          query: exaQuery,
          type: "auto",
          numResults: 10,
          contents: { text: { maxCharacters: 800 }, highlights: { numSentences: 2 } },
        },
      },
    );
    actualSpentUsdc += stepPrice("exa");

    const { tickers: exaTickers, slugs: exaSlugs } = extractFromExaData(exa.data);
    const messariSlugCsv = messariSlugsForStackB(userPrompt, exaSlugs);

    const messariUrl = `${MESSARI_DETAILS_URL}?slugs=${encodeURIComponent(messariSlugCsv)}&limit=10`;
    const [messari, vaultsNetworks, vaultsVaults] = await Promise.all([
      payStep("messari", messariUrl, targetChainId as SupportedChainId, {
        method: "GET",
        headers: { Accept: "application/json" },
      }),
      payStep("vaultsNetworks", VAULTS_NETWORKS_URL, targetChainId as SupportedChainId, {
        method: "GET",
        headers: { Accept: "application/json", "x-402-auth": "true" },
      }),
      payStep("vaultsVaults", VAULTS_VAULTS_URL, targetChainId as SupportedChainId, {
        method: "GET",
        headers: { Accept: "application/json", "x-402-auth": "true" },
      }),
    ]);
    actualSpentUsdc += stepPrice("messari") + stepPrice("vaultsNetworks") + stepPrice("vaultsVaults");

    const messariSymbols = extractMessariSymbols(messari.data);
    const gloriaTickers = gloriaTickersForStackB(userPrompt, exaTickers, messariSymbols);

    const gloria: Record<string, StackBStepResult> = {};
    for (const ticker of gloriaTickers) {
      const url = `${GLORIA_TICKER_URL}?ticker=${encodeURIComponent(ticker)}`;
      gloria[ticker] = await payStep("gloria", url, targetChainId as SupportedChainId, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      actualSpentUsdc += stepPrice("gloria");
    }

    const report: StackBReport = {
      stack: "B",
      prompt: userPrompt,
      messariSlugs: messariSlugCsv.split(",").filter(Boolean),
      gloriaTickers,
      chargedUsdc: totalUsdc,
      steps: { exa, messari, vaultsNetworks, vaultsVaults, gloria },
    };

    const rawResponse = JSON.stringify(report);
    const generatedContent = formatStackBForDisplay(report);

    const refreshed = await getUnifiedBalance(userWalletId).catch(() => unified);

    return {
      agentServiceId: RESEARCH_STACK_B_AGENT_ID,
      resourceUrl: EXA_URL,
      targetChainId,
      chargedUsdc: totalUsdc,
      ledgerBalance: updated.ledgerBalance,
      unifiedBalance: refreshed.totalUsdc,
      responseStatus: 200,
      responsePreview: rawResponse.slice(0, 2000),
      rawResponse,
      generatedContent,
      paymentRequiredObserved: true,
      onChainSettlementQueuedId,
    };
  } catch (error) {
    if (error instanceof UserStoreError) {
      const code =
        error.code === "INSUFFICIENT_BALANCE"
          ? "INSUFFICIENT_BALANCE"
          : error.code === "DUPLICATE_PAYMENT"
            ? "DUPLICATE_PAYMENT"
            : "SETTLEMENT_FAILED";
      throw new CircleServiceError(error.message, code);
    }

    if (ledgerEntryId && !userPrefunded) {
      cancelOnchainSettlementForLedgerEntry(ledgerEntryId);
    }

    if (debited && debitedAmount > 0 && !userPrefunded) {
      try {
        userStore.credit(
          clerkId,
          debitedAmount,
          ledgerLabelRefundX402(RESEARCH_STACK_B_AGENT_ID),
        );
        console.warn(
          `[stack-b] SQLite refund ${debitedAmount} USDC for clerkId=${clerkId}`,
        );
      } catch (rollbackError) {
        console.error("[stack-b] SQLite refund failed:", rollbackError);
      }
    } else if (debited && userPrefunded) {
      const refundAmount = Math.max(0, debitedAmount - actualSpentUsdc);
      try {
        if (refundAmount > 0) {
          userStore.credit(
            clerkId,
            refundAmount,
            ledgerLabelRefundX402(RESEARCH_STACK_B_AGENT_ID),
          );
          console.warn(
            `[stack-b] Partial SQLite refund ${refundAmount} USDC (API spent ${actualSpentUsdc.toFixed(6)}) for clerkId=${clerkId}`,
          );
        } else {
          console.warn(
            `[stack-b] No ledger refund — ${debitedAmount.toFixed(6)} USDC already transferred from user wallet (clerkId=${clerkId})`,
          );
        }
      } catch (rollbackError) {
        console.error("[stack-b] Partial SQLite refund failed:", rollbackError);
      }
    }

    if (error instanceof CircleServiceError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    throw new CircleServiceError(`Stack B failed: ${message}`, "SETTLEMENT_FAILED");
  }
}
