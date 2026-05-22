import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/sections/studio";

export const Route = createFileRoute("/_app/studio")({
  component: Studio,
  head: () => ({
    meta: [
      { title: "Studio · Nano.Agent" },
      { name: "description", content: "Generate content with your selected AI agent — paid per prompt in USDC." },
    ],
  }),
});
