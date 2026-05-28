/**
 * Iron-clad x402 nanopayment — Circle Agents Marketplace only.
 *
 * Protocol order:
 *  1. Discovery → resolve resource URL (Circle x402 catalog)
 *  2. Probe HTTP 402 → dynamic USDC price (never hardcoded UI price)
 *  3. SQLite ledger debit (exact agent price)
 *  4. GatewayClient.pay(resourceUrl) → marketplace content
 *  5. Queue on-chain User → Master USDC (batched; not awaited in HTTP)
 *  6. Return content to UI (on-chain tx completes via cron / background batch)
 *
 * On Gateway failure after debit: SQLite refund (credit).
 */
import { isSupportedChainId, type SupportedChainId } from "@/lib/chains";
import { probeX402ResourcePrice } from "@/lib/x402-probe";
import { extractX402MarketplaceContent } from "@/lib/x402-content";
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
  resolveAgentResource,
  STUDIO_AGENT_FALLBACK_PRICE_USDC,
} from "@/services/agent-service-map";
import {
  activateOnchainSettlement,
  cancelOnchainSettlementForLedgerEntry,
  processSettlementBatch,
  reserveOnchainSettlement,
  syncWalletCreditsForUser,
} from "@/server/services/onchain-settlement";
import { userStore, UserStoreError } from "@/server/storage/user-store";

const INSUFFICIENT_MSG = "Số dư không đủ để thanh toán cho Agent này";

/** HTTP 200 with `{ error: ... }` still means the agent call failed — must refund. */
function assertAgentResponseUsable(data: unknown, bodyText: string): void {
  if (!bodyText.trim()) {
    throw new CircleServiceError(
      "API Agent trả phản hồi rỗng sau thanh toán x402",
      "SETTLEMENT_FAILED",
    );
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if (obj.error != null && obj.error !== "") {
      const detail =
        typeof obj.error === "string"
          ? obj.error
          : typeof obj.error === "object" &&
              obj.error &&
              "message" in (obj.error as object)
            ? String((obj.error as { message?: unknown }).message)
            : JSON.stringify(obj.error).slice(0, 200);
      throw new CircleServiceError(
        `API Agent trả lỗi sau thanh toán x402: ${detail}`,
        "SETTLEMENT_FAILED",
      );
    }
  }
}

function messariAthQuery(prompt?: string): string {
  const params = new URLSearchParams({
    slugs: "bitcoin,ethereum,solana",
    limit: "5",
  });
  const q = prompt?.trim().toLowerCase() ?? "";
  if (q.includes("eth") && !q.includes("bitcoin")) {
    params.set("slugs", "ethereum");
    params.set("limit", "3");
  } else if (q.includes("sol")) {
    params.set("slugs", "bitcoin,ethereum,solana");
  }
  return params.toString();
}

function inferSurfSymbol(prompt?: string): string {
  const text = (prompt ?? "").toUpperCase();
  const fromDollar = text.match(/\$([A-Z0-9]{2,12})\b/);
  if (fromDollar?.[1]) return fromDollar[1];
  const candidates = text.match(/\b[A-Z]{2,12}\b/g) ?? [];
  for (const token of candidates) {
    if (!["API", "JSON", "HTTP", "USDC", "BASE", "X", "THREAD"].includes(token)) {
      return token;
    }
  }
  return "AAVE";
}

export function payOptionsForAgent(
  agentServiceId: string,
  prompt?: string,
): { method?: "GET" | "POST"; headers?: Record<string, string>; body?: unknown } | undefined {
  if (agentServiceId === "perplexity-social" && prompt?.trim()) {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: {
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "You are a crypto macro analyst writing for X (Twitter) in Vietnamese. " +
              "Respond with a structured thread: 6–10 bullet points, **bold** section titles, " +
              "150–300 words total. Cite recent news; avoid one-line answers.",
          },
          { role: "user", content: prompt.trim() },
        ],
        search_recency_filter: "week",
        max_tokens: 1024,
      },
    };
  }
  if (agentServiceId === "messari-analyst") {
    return { method: "GET", headers: { Accept: "application/json" } };
  }
  if (agentServiceId === "surf-news" || agentServiceId === "surf-tokenomics") {
    return { method: "GET", headers: { Accept: "application/json" } };
  }
  return undefined;
}

/** Append Messari query params to the resolved x402 resource URL. */
export function withAgentResourceQuery(
  agentServiceId: string,
  resourceUrl: string,
  prompt?: string,
): string {
  if (agentServiceId === "messari-analyst") {
    const sep = resourceUrl.includes("?") ? "&" : "?";
    return `${resourceUrl}${sep}${messariAthQuery(prompt)}`;
  }
  if (agentServiceId === "surf-tokenomics") {
    // Surf tokenomics requires one of `id` or `symbol`.
    const u = new URL(resourceUrl);
    if (!u.searchParams.has("id") && !u.searchParams.has("symbol")) {
      u.searchParams.set("symbol", inferSurfSymbol(prompt));
    }
    return u.toString();
  }
  return resourceUrl;
}

export async function processNanopaymentX402(
  clerkId: string,
  userWalletId: string,
  agentServiceId: string,
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

  const { resourceUrl: mappedUrl, discoveryItem } = await resolveAgentResource(agentServiceId);
  const resourceUrl = withAgentResourceQuery(agentServiceId, mappedUrl, prompt);
  console.info(`[x402] Discovery resource for ${agentServiceId}: ${resourceUrl}`);

  let probe;
  try {
    probe = await probeX402ResourcePrice(
      mappedUrl,
      targetChainId,
      discoveryItem.accepts,
    );
  } catch (probeError) {
    const fallback = STUDIO_AGENT_FALLBACK_PRICE_USDC[agentServiceId];
    if (fallback == null) throw probeError;
    console.warn(
      `[x402] Probe fallback for ${agentServiceId}: ${fallback} USDC`,
      probeError,
    );
    probe = { status: 402, paymentRequired: true, priceUsdc: fallback };
  }
  const agentPriceUsdc = probe.priceUsdc;
  console.info(`[x402] Dynamic agent price: ${agentPriceUsdc} USDC (HTTP ${probe.status})`);

  const unified = await getUnifiedBalance(userWalletId);
  const credits = await syncWalletCreditsForUser(clerkId, unified.totalUsdc);
  const spendable = credits.spendableCreditsUsdc;

  if (spendable < agentPriceUsdc) {
    throw new CircleServiceError(
      `${INSUFFICIENT_MSG}. Cần ${agentPriceUsdc} USDC, khả dụng ${spendable.toFixed(6)} USDC ` +
        `(ledger ${credits.ledgerBalance.toFixed(6)}, ví on-chain ${unified.totalUsdc.toFixed(6)}, ` +
        `đang giữ chuyển ${credits.holdUsdc.toFixed(6)}). ` +
        `Nạp USDC Base vào ví Content Credits hoặc mở Wallet để đồng bộ.`,
      "INSUFFICIENT_BALANCE",
    );
  }

  let debited = false;
  let debitedAmount = 0;
  let ledgerEntryId: string | undefined;
  let onChainSettlementQueuedId: string | undefined;

  try {
    const debitResult = userStore.debit(clerkId, agentPriceUsdc, {
      label: ledgerLabelX402(agentServiceId),
      agentId: agentServiceId,
      idempotencyKey,
    });
    const updated = debitResult.record;
    ledgerEntryId = debitResult.ledgerEntryId;
    debited = true;
    debitedAmount = agentPriceUsdc;

    const response = await settleWithMasterAgentBounded(
      resourceUrl,
      targetChainId as SupportedChainId,
      agentPriceUsdc,
      payOptionsForAgent(agentServiceId, prompt),
    );

    const httpStatus = response.status ?? 200;
    if (httpStatus >= 400) {
      throw new CircleServiceError(
        `API Agent trả lỗi HTTP ${httpStatus} (${new URL(resourceUrl).hostname})`,
        "SETTLEMENT_FAILED",
      );
    }

    const bodyText =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data ?? {});

    assertAgentResponseUsable(response.data, bodyText);

    onChainSettlementQueuedId = reserveOnchainSettlement({
      ledgerEntryId,
      userId: clerkId,
      circleWalletId: userWalletId,
      amountUsdc: agentPriceUsdc,
      targetChainId: targetChainId as SupportedChainId,
    });
    activateOnchainSettlement(onChainSettlementQueuedId);
    console.info(`[x402] Queued user→master settlement: ${onChainSettlementQueuedId}`);
    void processSettlementBatch().catch((err) => {
      console.warn("[x402] Background settlement batch failed:", err);
    });

    const refreshed = await getUnifiedBalance(userWalletId).catch(() => unified);

    return {
      agentServiceId,
      resourceUrl,
      targetChainId,
      chargedUsdc: agentPriceUsdc,
      ledgerBalance: updated.ledgerBalance,
      unifiedBalance: refreshed.totalUsdc,
      responseStatus: httpStatus,
      responsePreview: bodyText.slice(0, 2000),
      rawResponse: bodyText,
      generatedContent: extractX402MarketplaceContent(bodyText),
      paymentRequiredObserved: probe.paymentRequired,
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
      try {
        userStore.credit(clerkId, debitedAmount, ledgerLabelRefundX402(agentServiceId));
        console.warn(`[x402] SQLite refund ${debitedAmount} USDC for clerkId=${clerkId}`);
      } catch (rollbackError) {
        console.error("[x402] SQLite refund failed:", rollbackError);
      }
    }

    if (error instanceof CircleServiceError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    throw new CircleServiceError(`x402 nanopayment failed: ${message}`, "SETTLEMENT_FAILED");
  }
}
