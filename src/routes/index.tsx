import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/sections/landing";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "Nano.Agent — x402 AI agents paid with USDC" },
      {
        name: "description",
        content:
          "Call Messari & Perplexity via x402, format X threads. Fund Base USDC — no API keys required.",
      },
    ],
  }),
});

function LandingPage() {
  return (
    <>
      <Landing />
      <Toaster />
    </>
  );
}
