import { createFileRoute } from "@tanstack/react-router";
import { circleRuntimeReady } from "@/services/circleService";
import { isCircleConfigured } from "@/server/config/env";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          circle: circleRuntimeReady(),
          envConfigured: isCircleConfigured(),
          timestamp: new Date().toISOString(),
        });
      },
    },
  },
});
