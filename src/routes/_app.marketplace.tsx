import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/marketplace")({
  beforeLoad: () => {
    throw redirect({ to: "/studio" });
  },
  head: () => ({
    meta: [
      { title: "Marketplace · Nano.Agent" },
      {
        name: "description",
        content: "Browse autonomous AI agents — pay per call with USDC via x402.",
      },
    ],
  }),
});
