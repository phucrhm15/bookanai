import { createFileRoute } from "@tanstack/react-router";
import { Marketplace } from "@/components/sections/marketplace";

export const Route = createFileRoute("/_app/marketplace")({
  component: Marketplace,
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
