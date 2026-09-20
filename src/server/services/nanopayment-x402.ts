/**
 * Iron-clad x402 nanopayment — Circle Agents Marketplace only.
 *
 * Protocol order (exact x402 — Exa, Stack B):
 *  3. SQLite debit → 4. User wallet → x402 payer (Base) → 5. master pays API
 *
 * Gateway Polygon (Surf Crypto News):
 *  3. Pre-check master Gateway Polygon → 4. SQLite debit → 5. Gateway pay → 6. User → x402 (Base)
 *
 * On failure before user on-chain transfer: SQLite refund.
 */
import { isSupportedChainId, type SupportedChainId } from "@/lib/chains";
import { resolveAgentPaymentChain, arcTestnetGatewayReady } from "@/lib/arc-agent-network";
import { buildArcNanopaymentMemo, isArcChain } from "@/lib/arc-transaction-extensions";
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
  agentPrefersArcMainnet,
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
  if (agentServiceId === "surf-news") {
    return { method: "GET", headers: { Accept: "application/json" } };
  }
  if (agentServiceId === "arc-market-pulse") {
    return { method: "GET", headers: { Accept: "application/json" } };
  }
  if (agentServiceId === "arc-sonar-brief") {
    const q =
      prompt?.trim() ||
      "Explain why USDC as native gas on Arc blockchain matters for autonomous AI agents and nanopayments.";
    return {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: { query: q },
    };
  }
  // Arc Mainnet agents
  if (agentServiceId === "arc-defi-oracle" || agentServiceId === "arc-mainnet-pulse") {
    return { method: "GET", headers: { Accept: "application/json" } };
  }
  if (agentServiceId === "arc-chain-analytics") {
    const q =
      prompt?.trim() ||
      "Analyze Arc Mainnet on-chain activity: USDC flows, top contracts, bridge volume from CCTP.";
    return {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: { query: q },
    };
  }
  return undefined;
}

/** Append agent-specific query params to the resolved x402 resource URL. */
export function withAgentResourceQuery(
  agentServiceId: string,
  resourceUrl: string,
  _prompt?: string,
): string {
  void agentServiceId;
  void _prompt;
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

  let paymentChainId = targetChainId as SupportedChainId;

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
      paymentChainId,
      prompt,
      idempotencyKey,
    );
  }

  const { resourceUrl: mappedUrl, discoveryItem } = await resolveAgentResource(agentServiceId);
  const resolvedChain = resolveAgentPaymentChain({
    apiKey: (await import("@/server/config/env")).getServerEnv().CIRCLE_API_KEY,
    agentServiceId,
    accepts: discoveryItem.accepts,
    requestedChainId: paymentChainId,
  });

  if (resolvedChain !== paymentChainId) {
    console.info(
      `[x402] Chain routed ${paymentChainId} → ${resolvedChain} for ${agentServiceId}` +
        (arcTestnetGatewayReady(agentServiceId, discoveryItem.accepts) ? " (Arc gateway)" : ""),
    );
    paymentChainId = resolvedChain;
  }

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
      paymentChainId,
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
    const arcHint = agentUsesGatewayPolygonPay(agentServiceId)
      ? ""
      : agentServiceId.startsWith("arc-")
        ? " Agent Arc: KEY TEST dùng faucet Arc USDC; KEY LIVE settle trên Base."
        : "";
    throw new CircleServiceError(
      `${INSUFFICIENT_MSG}. Cần ${agentPriceUsdc} USDC, khả dụng ${spendable.toFixed(6)} USDC ` +
        `(ledger ${credits.ledgerBalance.toFixed(6)}, ví on-chain ${unified.totalUsdc.toFixed(6)}, ` +
        `đang giữ chuyển ${credits.holdUsdc.toFixed(6)}). ` +
        `Nạp USDC Base vào ví Content Credits hoặc mở Wallet để đồng bộ.${arcHint}`,
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

    const isArcMainnetAgent = agentPrefersArcMainnet(agentServiceId);

    if (!usesGatewayPolygon && !isArcMainnetAgent) {
      // Normal flow: collect user USDC first, then master pays API
      const prefund = await collectUserUsdcForX402({
        clerkId,
        userWalletId,
        ledgerEntryId,
        amountUsdc: agentPriceUsdc,
        targetChainId: paymentChainId,
        agentId: agentServiceId,
      });
      userPrefunded = true;
      onChainSettlementQueuedId = prefund.settlementId;
    }
    // Arc Mainnet agents: master pays API first (Circle DCW does not support ARC mainnet),
    // user settlement queued post-pay as a batch (same pattern as Gateway Polygon/Surf).

    const response = await settleWithMasterAgentBounded(
      resourceUrl,
      paymentChainId,
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

    if (usesGatewayPolygon || isArcMainnetAgent) {
      // Post-pay settlement: master already paid API, now queue user→master reimbursement.
      // Arc Mainnet: Circle DCW does not support ARC blockchain, so we queue via batch settler
      // which will use EVM signing-only path or retry when Circle adds ARC mainnet support.
      const settlementLabel = isArcMainnetAgent ? "Arc Mainnet" : "Surf Gateway";
      try {
        const prefund = await collectUserUsdcForX402({
          clerkId,
          userWalletId,
          ledgerEntryId,
          amountUsdc: agentPriceUsdc,
          targetChainId: paymentChainId,
          agentId: agentServiceId,
        });
        onChainSettlementQueuedId = prefund.settlementId;
        userPrefunded = true;
      } catch (transferErr) {
        console.warn(
          `[x402] ${settlementLabel} post-pay user→x402 transfer failed, queue batch:`,
          transferErr,
        );
        onChainSettlementQueuedId = reserveOnchainSettlement({
          ledgerEntryId,
          userId: clerkId,
          circleWalletId: userWalletId,
          amountUsdc: agentPriceUsdc,
          targetChainId: paymentChainId,
        });
        activateOnchainSettlement(onChainSettlementQueuedId);
        try {
          await processSettlementBatchForUser(clerkId);
        } catch (batchErr) {
          console.warn(
            `[x402] ${settlementLabel} settlement batch failed (retry on Wallet sync):`,
            batchErr,
          );
        }
      }
    }

    const refreshed = await getUnifiedBalance(userWalletId).catch(() => unified);

    const arcOnChainMemo =
      ledgerEntryId && isArcChain(paymentChainId)
        ? buildArcNanopaymentMemo({
            ledgerEntryId,
            agentId: agentServiceId,
            settlementId: onChainSettlementQueuedId,
          })
        : undefined;

    return {
      agentServiceId,
      resourceUrl,
      targetChainId: paymentChainId,
      chargedUsdc: agentPriceUsdc,
      ledgerBalance: updated.ledgerBalance,
      unifiedBalance: refreshed.totalUsdc,
      responseStatus: httpStatus,
      responsePreview: bodyText.slice(0, 2000),
      rawResponse: bodyText,
      generatedContent: extractX402MarketplaceContent(bodyText),
      paymentRequiredObserved: probe.paymentRequired,
      onChainSettlementQueuedId,
      arcOnChainMemo,
      arcTestnetGateway: arcTestnetGatewayReady(agentServiceId, discoveryItem.accepts),
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
