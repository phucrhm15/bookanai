import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedAdminRequest } from "@/server/auth/admin-secret";
import { getMasterAgentStatus } from "@/services/masterAgent";

export const Route = createFileRoute("/api/master/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthorizedAdminRequest(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        try {
          const status = await getMasterAgentStatus();
          return Response.json(status);
        } catch (error) {
          console.error("[GET /api/master/status]", error);
          return Response.json(
            { error: error instanceof Error ? error.message : "Master agent error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
