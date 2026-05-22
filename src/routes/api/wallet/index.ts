import { createFileRoute } from "@tanstack/react-router";
import { ARC_NETWORK, BASE_NETWORK, USDC_CONTRACT_ADDRESS } from "@/lib/mock-data";
import {
  ARC_USDC_CONTRACT_ADDRESS,
  BASE_USDC_CONTRACT_ADDRESS,
  circleRuntimeReady,
  getOrCreateUserWallet,
} from "@/services/circleService";
import { getServerEnv } from "@/server/config/env";
import { userStore } from "@/server/storage/user-store";

export const Route = createFileRoute("/api/wallet/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!circleRuntimeReady()) {
            return Response.json(
              { error: "Circle is not configured. Set env vars from .env.local.example." },
              { status: 503 },
            );
          }

          const body = (await request.json().catch(() => ({}))) as { userId?: string };
          const env = getServerEnv();
          const userId = body.userId ?? env.DEMO_USER_ID;

          const wallet = await getOrCreateUserWallet(userId);

          return Response.json(
            {
              userId: wallet.userId,
              walletId: wallet.circleWalletId,
              address: wallet.address,
              ledgerBalance: wallet.ledgerBalance,
              unifiedBalance: wallet.unifiedBalance,
            },
            { status: 201 },
          );
        } catch (error) {
          console.error("[POST /api/wallet]", error);
          return Response.json(
            { error: error instanceof Error ? error.message : "Wallet provisioning error" },
            { status: 500 },
          );
        }
      },

      GET: async ({ request }) => {
        try {
          if (!circleRuntimeReady()) {
            return Response.json(
              { error: "Circle is not configured. Set env vars from .env.local.example." },
              { status: 503 },
            );
          }

          const url = new URL(request.url);
          const env = getServerEnv();
          const userId = url.searchParams.get("userId") ?? env.DEMO_USER_ID;

          const wallet = await getOrCreateUserWallet(userId);
          const user = userStore.getByUserId(userId);

          return Response.json({
            userId: wallet.userId,
            walletId: wallet.circleWalletId,
            address: wallet.address,
            ledgerBalance: wallet.ledgerBalance,
            unifiedBalance: wallet.unifiedBalance,
            usdcContractAddress: USDC_CONTRACT_ADDRESS,
            networks: {
              base: {
                ...BASE_NETWORK,
                usdcContractAddress: BASE_USDC_CONTRACT_ADDRESS,
              },
              arc: {
                ...ARC_NETWORK,
                usdcContractAddress: ARC_USDC_CONTRACT_ADDRESS,
              },
            },
            network: ARC_NETWORK,
            transactions: user?.transactions ?? [],
          });
        } catch (error) {
          console.error("[GET /api/wallet]", error);
          return Response.json(
            { error: error instanceof Error ? error.message : "Wallet error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
