import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/sections/studio";

export const Route = createFileRoute("/_app/studio")({
  component: Studio,
  head: () => ({
    meta: [
      { title: "Arc Research Studio · BookAnAI" },
      { name: "description", content: "Research crypto and Arc with a cited AI report, paid per request in USDC on Arc Mainnet." },
    ],
  }),
});
