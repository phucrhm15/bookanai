import { createFileRoute } from "@tanstack/react-router";
import { ARC_CHAIN_ID } from "@/lib/chains";
import {
  CircleServiceError,
  handleNanopaymentX402,
  circleRuntimeReady,
} from "@/services/circleService";

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

          const body = (await request.json()) as {
            userWalletId?: string;
            agentServiceId?: string;
            targetChainId?: number;
          };

          if (!body.userWalletId || !body.agentServiceId) {
            return Response.json(
              { error: "userWalletId and agentServiceId are required" },
              { status: 400 },
            );
          }

          const targetChainId = body.targetChainId ?? ARC_CHAIN_ID;

          const result = await handleNanopaymentX402(
            body.userWalletId,
            body.agentServiceId,
            targetChainId,
          );

          return Response.json(result);
        } catch (error) {
          console.error("[POST /api/wallet/nanopayment]", error);
          if (error instanceof CircleServiceError) {
            const status =
              error.code === "INSUFFICIENT_BALANCE"
                ? 402
                : error.code === "UNSUPPORTED_CHAIN"
                  ? 400
                  : error.code === "NETWORK_ERROR"
                    ? 504
                    : 500;
            return Response.json({ error: error.message, code: error.code }, { status });
          }
          const message = error instanceof Error ? error.message : "Nanopayment error";
          const status = message.includes("Insufficient") ? 402 : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
