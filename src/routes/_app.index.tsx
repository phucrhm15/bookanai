import { createFileRoute } from "@tanstack/react-router";
import { Marketplace } from "@/components/sections/marketplace";

export const Route = createFileRoute("/_app/")({
  component: Marketplace,
  head: () => ({
    meta: [
      { title: "Marketplace · Nano.Agent" },
      { name: "description", content: "Browse autonomous AI agents that post on X for fractions of a cent." },
    ],
  }),
});
