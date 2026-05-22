import { createFileRoute } from "@tanstack/react-router";
import { getMasterAgentStatus } from "@/services/masterAgent";

export const Route = createFileRoute("/api/master/status")({
  server: {
    handlers: {
      GET: async () => {
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
