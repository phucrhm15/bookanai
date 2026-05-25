import { createFileRoute } from "@tanstack/react-router";
import { getMasterAgentStatus } from "@/services/masterAgent";

function requireAdminSecret(request: Request): boolean {
  const secret = process.env.SETTLEMENT_CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export const Route = createFileRoute("/api/master/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireAdminSecret(request)) {
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
