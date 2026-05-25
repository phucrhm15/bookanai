import { createFileRoute } from "@tanstack/react-router";
import { defaultPaymentChainId } from "@/lib/circle-dcw-blockchains";
import { getServerEnv } from "@/server/config/env";
import { NANOPAYMENT_ROUTE_BUDGET_MS } from "@/server/config/api-timeouts";
import { CircleServiceError } from "@/services/circle-errors";
import { circleRuntimeReady, ensureClerkUserWalletSynced } from "@/services/circleService";
import { processNanopaymentX402 } from "@/server/services/nanopayment-x402";
import {
  requireClerkUserId,
  unauthorizedJsonResponse,
  UnauthorizedError,
} from "@/server/auth/clerk-session";
import { userStore } from "@/server/storage/user-store";

function withRouteBudget<T>(work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new CircleServiceError(
            `Nanopayment route exceeded ${NANOPAYMENT_ROUTE_BUDGET_MS}ms`,
            "TIMEOUT",
          ),
        ),
      NANOPAYMENT_ROUTE_BUDGET_MS,
    );
    work()
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * POST /api/wallet/nanopayment
 *
 * Iron-clad x402 only — Circle Agents Marketplace (https://agents.circle.com/services).
 * No OpenAI · No CoinGecko · No mock fallbacks · No hardcoded UI pricing.
 *
 * Delegates to processNanopaymentX402():
 *   Discovery → Probe 402 price → SQLite debit → Queue user→master → Gateway pay → Content
 */
export const Route = createFileRoute("/api/wallet/nanopayment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!circleRuntimeReady()) {
            return Response.json(
              { error: "Circle is not configured. Set env vars from .env.local.example." },
              { status: 503 },
            );
          }

          const clerkId = await requireClerkUserId();

          const body = (await request.json()) as {
            userWalletId?: string;
            agentServiceId?: string;
            targetChainId?: number;
            prompt?: string;
            idempotencyKey?: string;
          };

          if (!body.userWalletId || !body.agentServiceId) {
            return Response.json(
              { error: "userWalletId and agentServiceId are required" },
              { status: 400 },
            );
          }

          const walletOwner = userStore.getByWalletId(body.userWalletId);
          if (!walletOwner || walletOwner.userId !== clerkId) {
            return Response.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
          }

          await ensureClerkUserWalletSynced(clerkId);

          const env = getServerEnv();
          const targetChainId = body.targetChainId ?? defaultPaymentChainId(env.CIRCLE_API_KEY);

          const result = await withRouteBudget(() =>
            processNanopaymentX402(
              clerkId,
              body.userWalletId!,
              body.agentServiceId!,
              targetChainId,
              body.prompt,
              body.idempotencyKey,
            ),
          );

          return Response.json(result);
        } catch (error) {
          console.error("\n❌ [NANOPAYMENT ERROR]:", error);
          if (error instanceof Error && error.stack) {
            console.error(error.stack);
          }

          if (error instanceof UnauthorizedError) {
            return unauthorizedJsonResponse();
          }
          if (error instanceof Error && error.name === "UserStoreError") {
            const storeErr = error as { code?: string; message: string };
            const status = storeErr.code === "INSUFFICIENT_BALANCE" ? 402 : 400;
            return Response.json({ error: storeErr.message, code: storeErr.code }, { status });
          }
          if (error instanceof CircleServiceError) {
            const status =
              error.code === "INSUFFICIENT_BALANCE"
                ? 402
                : error.code === "DUPLICATE_PAYMENT"
                  ? 409
                : error.code === "UNSUPPORTED_CHAIN"
                  ? 400
                  : error.code === "NETWORK_ERROR" || error.code === "TIMEOUT"
                    ? 504
                    : 500;
            return Response.json({ error: error.message, code: error.code }, { status });
          }
          const message = error instanceof Error ? error.message : "Nanopayment error";
          const status =
            message.includes("Số dư không đủ") || message.includes("Insufficient") ? 402 : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
