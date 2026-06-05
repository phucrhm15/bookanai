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
  activateOnchainSettlement,
  cancelOnchainSettlementForLedgerEntry,
  processSettlementBatchForUser,
  reserveOnchainSettlement,
  syncWalletCreditsForUser,
} from "@/server/services/onchain-settlement";
import { userStore, UserStoreError } from "@/server/storage/user-store";
import {
  formatStackBForDisplay,
  type StackBReport,
  type StackBStepResult,
} from "@/lib/stack-b-format";
import {
  assertMasterBaseUsdcBalance,
  getMasterX402DepositorAddress,
} from "@/server/services/x402-master-pay";

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

const DEFAULT_MESSARI_SLUGS = [
  "solana",
  "hyperliquid",
  "avalanche-2",
  "chainlink",
  "aave",
  "uniswap",
  "arbitrum",
  "optimism",
  "sui",
  "dogecoin",
] as const;

const DEFAULT_GLORIA_TICKERS = ["SOL", "AVAX", "LINK"] as const;

const TICKER_TO_SLUG: Record<string, string> = {
  SOL: "solana",
  HYPE: "hyperliquid",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  AAVE: "aave",
  UNI: "uniswap",
  ARB: "arbitrum",
  OP: "optimism",
  SUI: "sui",
  DOGE: "dogecoin",
  ADA: "cardano",
  DOT: "polkadot",
  NEAR: "near",
  RNDR: "render-token",
  FET: "fetch-ai",
  TIA: "celestia",
  SEI: "sei-network",
  MNT: "mantle",
  APT: "aptos",
  INJ: "injective",
  BTC: "bitcoin",
  ETH: "ethereum",
  XRP: "xrp",
  BNB: "binance-coin",
};

type StepKey = keyof typeof STEP_PRICES;

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

function extractTickersFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\$([A-Z0-9]{2,12})\b/g)) {
    found.add(match[1]!);
  }
  for (const match of text.matchAll(/\b([A-Z]{2,12})\b/g)) {
    const token = match[1]!;
    if (
      !["API", "JSON", "HTTP", "USDC", "BASE", "ETH", "BTC", "XRP", "BNB", "USD", "ETF"].includes(
        token,
      )
    ) {
      found.add(token);
    }
  }
  return [...found];
}

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
  const blob = textParts.join("\n");
  const tickers = extractTickersFromText(blob);
  const slugs = tickers
    .map((t) => TICKER_TO_SLUG[t])
    .filter((s): s is string => Boolean(s));
  return { tickers, slugs: [...new Set(slugs)] };
}

function messariSlugsForPrompt(prompt: string, exaSlugs: string[]): string {
  const fromPrompt = extractTickersFromText(prompt.toUpperCase())
    .map((t) => TICKER_TO_SLUG[t])
    .filter(Boolean);
  const merged = [...new Set([...exaSlugs, ...fromPrompt, ...DEFAULT_MESSARI_SLUGS])].slice(
    0,
    10,
  );
  return merged.join(",");
}

function gloriaTickersForPrompt(prompt: string, exaTickers: string[]): string[] {
  const fromPrompt = extractTickersFromText(prompt.toUpperCase());
  const merged = [...new Set([...exaTickers, ...fromPrompt, ...DEFAULT_GLORIA_TICKERS])];
  const filtered = merged.filter(
    (t) => !["BTC", "ETH", "XRP", "BNB", "USDC", "USDT"].includes(t),
  );
  return (filtered.length >= 3 ? filtered : [...DEFAULT_GLORIA_TICKERS]).slice(0, 3);
}

async function queueUserReimbursement(
  clerkId: string,
  userWalletId: string,
  ledgerEntryId: string,
  amountUsdc: number,
  targetChainId: SupportedChainId,
): Promise<string | undefined> {
  if (amountUsdc <= 0) return undefined;
  const id = reserveOnchainSettlement({
    ledgerEntryId,
    userId: clerkId,
    circleWalletId: userWalletId,
    amountUsdc,
    targetChainId,
  });
  activateOnchainSettlement(id);
  console.info(`[stack-b] Queued user→x402 reimbursement: ${id} (${amountUsdc} USDC)`);
  try {
    await processSettlementBatchForUser(clerkId);
  } catch (err) {
    console.warn("[stack-b] user→x402 settlement batch failed (will retry on Wallet sync):", err);
  }
  return id;
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

  const userPrompt = prompt?.trim() || "Top crypto altcoins research ex stables BTC ETH BNB XRP";
  const totalUsdc = stackTotalUsdc();
  console.info(`[stack-b] Estimated total: ${totalUsdc} USDC`);

  try {
    await assertMasterBaseUsdcBalance(totalUsdc);
  } catch (error) {
    if (error instanceof CircleServiceError) {
      const addr = getMasterX402DepositorAddress();
      throw new CircleServiceError(
        `${error.message} Stack B cần ~${totalUsdc.toFixed(3)} USDC on-chain trên Base tại ${addr} (admin nạp, không phải Content Credits user).`,
        "INSUFFICIENT_BALANCE",
      );
    }
    throw error;
  }

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

    const exa = await payStep(
      "exa",
      EXA_URL,
      targetChainId as SupportedChainId,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: {
          query: userPrompt,
          type: "auto",
          numResults: 8,
          contents: { text: { maxCharacters: 800 }, highlights: { numSentences: 2 } },
        },
      },
    );
    actualSpentUsdc += stepPrice("exa");

    const { tickers: exaTickers, slugs: exaSlugs } = extractFromExaData(exa.data);
    const messariSlugs = messariSlugsForPrompt(userPrompt, exaSlugs);
    const gloriaTickers = gloriaTickersForPrompt(userPrompt, exaTickers);

    const messariUrl = `${MESSARI_DETAILS_URL}?slugs=${encodeURIComponent(messariSlugs)}&limit=10`;
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
      messariSlugs: messariSlugs.split(","),
      gloriaTickers,
      chargedUsdc: totalUsdc,
      steps: { exa, messari, vaultsNetworks, vaultsVaults, gloria },
    };

    const rawResponse = JSON.stringify(report);
    const generatedContent = formatStackBForDisplay(report);

    onChainSettlementQueuedId = await queueUserReimbursement(
      clerkId,
      userWalletId,
      ledgerEntryId,
      totalUsdc,
      targetChainId as SupportedChainId,
    );

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

    if (ledgerEntryId) {
      cancelOnchainSettlementForLedgerEntry(ledgerEntryId);
    }

    if (debited && debitedAmount > 0) {
      const refundAmount = Math.max(0, debitedAmount - actualSpentUsdc);
      try {
        if (refundAmount > 0) {
          userStore.credit(
            clerkId,
            refundAmount,
            ledgerLabelRefundX402(RESEARCH_STACK_B_AGENT_ID),
          );
          console.warn(
            `[stack-b] SQLite refund ${refundAmount} USDC (spent ${actualSpentUsdc.toFixed(6)}) for clerkId=${clerkId}`,
          );
        }
        if (actualSpentUsdc > 0 && ledgerEntryId) {
          onChainSettlementQueuedId = await queueUserReimbursement(
            clerkId,
            userWalletId,
            ledgerEntryId,
            actualSpentUsdc,
            targetChainId as SupportedChainId,
          );
        }
      } catch (rollbackError) {
        console.error("[stack-b] SQLite refund / partial settlement failed:", rollbackError);
      }
    }

    if (error instanceof CircleServiceError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    throw new CircleServiceError(`Stack B failed: ${message}`, "SETTLEMENT_FAILED");
  }
}
