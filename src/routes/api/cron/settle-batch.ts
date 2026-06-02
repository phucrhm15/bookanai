import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedAdminRequest } from "@/server/auth/admin-secret";
import { processSettlementBatch } from "@/server/services/onchain-settlement";

export const Route = createFileRoute("/api/cron/settle-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedAdminRequest(request)) {
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
