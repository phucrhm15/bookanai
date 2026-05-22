import { createFileRoute } from "@tanstack/react-router";
import { WalletPage } from "@/components/sections/wallet-page";

export const Route = createFileRoute("/_app/wallet")({
  component: WalletPage,
  head: () => ({
    meta: [
      { title: "Wallet & Billing · Nano.Agent" },
      { name: "description", content: "Manage your agent embedded wallet and USDC nanopayments." },
    ],
  }),
});
