import { createFileRoute } from "@tanstack/react-router";
import { privateKeyToAccount } from "viem/accounts";
import { isAuthorizedAdminRequest } from "@/server/auth/admin-secret";
import { getServerEnv } from "@/server/config/env";

/**
 * Operator-only diagnostics (Bearer SETTLEMENT_CRON_SECRET).
 * Disabled in production when secret is unset.
 */
export const Route = createFileRoute("/api/debug/x402")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthorizedAdminRequest(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        try {
          const env = getServerEnv();
          const masterAddress = privateKeyToAccount(
            env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`,
          ).address;

          const { GatewayClient } = await import("@circle-fin/x402-batching/client");

          async function gatewayAvailable(
            chain: "base" | "polygon",
            rpcUrl: string,
          ): Promise<{ available: string; error?: string }> {
            try {
              const client = new GatewayClient({
                chain,
                privateKey: env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`,
                rpcUrl,
              });
              // getBalance() hits Circle Gateway API over HTTP (no RPC) — this is
              // what the real pay path uses.
              const gatewayBalance = await (
                client as unknown as {
                  getBalance: (a?: string) => Promise<{ formattedAvailable: string }>;
                }
              ).getBalance(masterAddress);
              return { available: gatewayBalance.formattedAvailable };
            } catch (error) {
              return {
                available: "0",
                error: error instanceof Error ? error.message : String(error),
              };
            }
          }

          const [base, polygon] = await Promise.all([
            gatewayAvailable("base", env.BASE_RPC_URL),
            gatewayAvailable("polygon", env.POLYGON_RPC_URL),
          ]);

          return Response.json({
            commit: process.env.RENDER_GIT_COMMIT ?? "unknown",
            nodeEnv: process.env.NODE_ENV ?? "unknown",
            masterAddress,
            polygonRpcUrl: env.POLYGON_RPC_URL,
            baseRpcUrl: env.BASE_RPC_URL,
            gateway: { base, polygon },
          });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "debug error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
