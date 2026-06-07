/**
 * Iron-clad x402 nanopayment — Circle Agents Marketplace only.
 *
 * Protocol order (exact x402 — Exa, Messari, Stack B):
 *  3. SQLite debit → 4. User wallet → x402 payer (Base) → 5. master pays API
 *
 * Gateway Polygon (Surf):
 *  3. Pre-check master Gateway Polygon → 4. SQLite debit → 5. Gateway pay → 6. User → x402 (Base)
 *
 * On failure before user on-chain transfer: SQLite refund.
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
  agentUsesGatewayPolygonPay,
} from "@/services/agent-service-map";
import {
  assertMasterGatewayPolygonUsdc,
} from "@/server/services/x402-master-pay";
import {
  activateOnchainSettlement,
  cancelOnchainSettlementForLedgerEntry,
  processSettlementBatchForUser,
  reserveOnchainSettlement,
  syncWalletCreditsForUser,
} from "@/server/services/onchain-settlement";
import { collectUserUsdcForX402 } from "@/server/services/user-x402-prefund";
import { userStore, UserStoreError } from "@/server/storage/user-store";
import {
  processResearchStackB,
  RESEARCH_STACK_B_AGENT_ID,
} from "@/server/services/research-stack-b";

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
        query: prompt.trim(),
        type: "auto",
        numResults: 8,
        contents: { text: { maxCharacters: 800 }, highlights: { numSentences: 2 } },
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

  if (agentServiceId === RESEARCH_STACK_B_AGENT_ID) {
    return processResearchStackB(
      clerkId,
      userWalletId,
      targetChainId,
      prompt,
      idempotencyKey,
    );
  }

  const { resourceUrl: mappedUrl, discoveryItem } = await resolveAgentResource(agentServiceId);
  const resourceUrl = withAgentResourceQuery(agentServiceId, mappedUrl, prompt);
  console.info(`[x402] Discovery resource for ${agentServiceId}: ${resourceUrl}`);

  const payOptions = payOptionsForAgent(agentServiceId, prompt);
  const probeInit = payOptions
    ? {
        method: payOptions.method,
        headers: payOptions.headers,
        body: payOptions.body,
      }
    : undefined;

  let probe;
  try {
    probe = await probeX402ResourcePrice(
      mappedUrl,
      targetChainId,
      discoveryItem.accepts,
      probeInit,
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

  const usesGatewayPolygon = agentUsesGatewayPolygonPay(agentServiceId);

  if (usesGatewayPolygon) {
    try {
      await assertMasterGatewayPolygonUsdc(agentPriceUsdc);
    } catch (error) {
      if (error instanceof CircleServiceError) {
        throw new CircleServiceError(
          `${error.message} Content Credits của bạn đủ — lỗi ở ví Gateway Polygon của server (Surf).`,
          error.code ?? "INSUFFICIENT_BALANCE",
        );
      }
      throw error;
    }
  }

  let debited = false;
  let debitedAmount = 0;
  let ledgerEntryId: string | undefined;
  let onChainSettlementQueuedId: string | undefined;
  let userPrefunded = false;

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

    if (!usesGatewayPolygon) {
      const prefund = await collectUserUsdcForX402({
        clerkId,
        userWalletId,
        ledgerEntryId,
        amountUsdc: agentPriceUsdc,
        targetChainId: targetChainId as SupportedChainId,
      });
      userPrefunded = true;
      onChainSettlementQueuedId = prefund.settlementId;
    }

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

    if (usesGatewayPolygon) {
      try {
        const prefund = await collectUserUsdcForX402({
          clerkId,
          userWalletId,
          ledgerEntryId,
          amountUsdc: agentPriceUsdc,
          targetChainId: targetChainId as SupportedChainId,
        });
        onChainSettlementQueuedId = prefund.settlementId;
        userPrefunded = true;
      } catch (transferErr) {
        console.warn("[x402] Surf post-pay user→x402 transfer failed, queue batch:", transferErr);
        onChainSettlementQueuedId = reserveOnchainSettlement({
          ledgerEntryId,
          userId: clerkId,
          circleWalletId: userWalletId,
          amountUsdc: agentPriceUsdc,
          targetChainId: targetChainId as SupportedChainId,
        });
        activateOnchainSettlement(onChainSettlementQueuedId);
        try {
          await processSettlementBatchForUser(clerkId);
        } catch (batchErr) {
          console.warn("[x402] Surf settlement batch failed (retry on Wallet sync):", batchErr);
        }
      }
    }

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

    if (debited && debitedAmount > 0 && !userPrefunded) {
      try {
        userStore.credit(clerkId, debitedAmount, ledgerLabelRefundX402(agentServiceId));
        console.warn(
          `[x402] SQLite refund ${debitedAmount} USDC for clerkId=${clerkId}` +
            (usesGatewayPolygon ? " (Surf Gateway failed — user not charged on-chain)" : ""),
        );
      } catch (rollbackError) {
        console.error("[x402] SQLite refund failed:", rollbackError);
      }
    } else if (userPrefunded) {
      console.warn(
        `[x402] No ledger refund — ${debitedAmount} USDC already transferred from user wallet (clerkId=${clerkId})`,
      );
    }

    if (error instanceof CircleServiceError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    throw new CircleServiceError(`x402 nanopayment failed: ${message}`, "SETTLEMENT_FAILED");
  }
}
