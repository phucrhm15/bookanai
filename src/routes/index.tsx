import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/sections/landing";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "BookAnAI — Arc Research paid with x402" },
      {
        name: "description",
        content:
          "Research crypto and Arc with AI search, paid per request in USDC on Arc Mainnet.",
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
