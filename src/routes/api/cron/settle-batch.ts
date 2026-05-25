import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv } from "@/server/config/env";
import { processSettlementBatch } from "@/server/services/onchain-settlement";

function authorizeCron(request: Request): boolean {
  const env = getServerEnv();
  const secret = env.SETTLEMENT_CRON_SECRET ?? process.env.SETTLEMENT_CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const cronHeader = request.headers.get("x-cron-secret");
  return bearer === secret || cronHeader === secret;
}

export const Route = createFileRoute("/api/cron/settle-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorizeCron(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const result = await processSettlementBatch();
          return Response.json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Batch settlement failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
