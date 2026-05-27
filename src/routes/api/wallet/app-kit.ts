import { createFileRoute } from "@tanstack/react-router";
import {
  requireClerkUserId,
  unauthorizedJsonResponse,
  UnauthorizedError,
} from "@/server/auth/clerk-session";
import { getServerEnv } from "@/server/config/env";
import {
  appKitBridge,
  appKitDeposit,
  appKitGetBalances,
  appKitGetSupportedChains,
  appKitSpend,
  appKitSwap,
  isAppKitConfigured,
  isAppKitSwapSendEnabled,
  supportedPaymentChains,
} from "@/server/services/circle-app-kit";
import { CircleServiceError } from "@/services/circle-errors";

type AppKitBody = {
  action?: string;
  amount?: string;
  chain?: string;
  fromChain?: string;
  toChain?: string;
  recipientAddress?: string;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: string;
};

function jsonError(error: unknown, status = 500) {
  if (error instanceof UnauthorizedError) {
    return unauthorizedJsonResponse();
  }
  const message = error instanceof Error ? error.message : "App Kit request failed";
  const code = error instanceof CircleServiceError ? error.code : undefined;
  return Response.json({ error: message, code }, { status });
}

export const Route = createFileRoute("/api/wallet/app-kit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          if (!isAppKitConfigured()) {
            return Response.json(
              { error: "Circle is not configured" },
              { status: 503 },
            );
          }

          const clerkId = await requireClerkUserId();
          const url = new URL(request.url);
          const op = url.searchParams.get("op") ?? "meta";

          if (op === "balances") {
            const balances = await appKitGetBalances(clerkId);
            return Response.json(balances);
          }

          if (op === "chains") {
            const kind = (url.searchParams.get("kind") ?? "bridge") as
              | "bridge"
              | "swap"
              | "unifiedBalance";
            const chains = await appKitGetSupportedChains(kind);
            return Response.json({ chains });
          }

          const env = getServerEnv();
          return Response.json({
            swapEnabled: isAppKitSwapSendEnabled(),
            paymentChains: supportedPaymentChains(env.CIRCLE_API_KEY),
          });
        } catch (error) {
          return jsonError(error);
        }
      },

      POST: async ({ request }) => {
        try {
          if (!isAppKitConfigured()) {
            return Response.json(
              { error: "Circle is not configured" },
              { status: 503 },
            );
          }

          const clerkId = await requireClerkUserId();
          const body = (await request.json().catch(() => ({}))) as AppKitBody;
          const action = body.action?.trim();

          if (!action) {
            return Response.json({ error: "Missing action" }, { status: 400 });
          }

          if (action === "deposit") {
            if (!body.amount?.trim()) {
              return Response.json({ error: "Missing amount" }, { status: 400 });
            }
            const result = await appKitDeposit({
              clerkId,
              amount: body.amount.trim(),
              chain: body.chain,
            });
            return Response.json(result);
          }

          if (action === "bridge") {
            if (!body.amount || !body.fromChain || !body.toChain) {
              return Response.json(
                { error: "Missing amount, fromChain, or toChain" },
                { status: 400 },
              );
            }
            const result = await appKitBridge({
              clerkId,
              amount: body.amount,
              fromChain: body.fromChain,
              toChain: body.toChain,
            });
            return Response.json(result);
          }

          if (action === "spend" || action === "withdraw") {
            if (!body.amount || !body.recipientAddress) {
              return Response.json(
                { error: "Missing amount or recipientAddress" },
                { status: 400 },
              );
            }
            const result = await appKitSpend({
              clerkId,
              amount: body.amount,
              recipientAddress: body.recipientAddress,
              fromChain: body.fromChain,
              toChain: body.toChain,
            });
            return Response.json(result);
          }

          if (action === "swap") {
            if (!body.chain || !body.tokenIn || !body.tokenOut || !body.amountIn) {
              return Response.json(
                { error: "Missing chain, tokenIn, tokenOut, or amountIn" },
                { status: 400 },
              );
            }
            const result = await appKitSwap({
              clerkId,
              chain: body.chain,
              tokenIn: body.tokenIn,
              tokenOut: body.tokenOut,
              amountIn: body.amountIn,
            });
            return Response.json(result);
          }

          return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
