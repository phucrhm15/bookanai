import { createFileRoute } from "@tanstack/react-router";
import { defaultPaymentChainId } from "@/lib/circle-dcw-blockchains";
import { ARC_NETWORK, BASE_NETWORK } from "@/lib/mock-data";
import {
  ARC_USDC_CONTRACT_ADDRESS,
  BASE_USDC_CONTRACT_ADDRESS,
  circleRuntimeReady,
  ensureClerkUserWalletSynced,
} from "@/services/circleService";
import { getServerEnv } from "@/server/config/env";
import {
  requireClerkUserId,
  unauthorizedJsonResponse,
  UnauthorizedError,
} from "@/server/auth/clerk-session";
import { syncWalletCreditsForUser } from "@/server/services/onchain-settlement";
import { userStore } from "@/server/storage/user-store";

export const Route = createFileRoute("/api/wallet/")({
  server: {
    handlers: {
      POST: async () => {
        try {
          if (!circleRuntimeReady()) {
            return Response.json(
              { error: "Circle is not configured. Set env vars from .env.local.example." },
              { status: 503 },
            );
          }

          const clerkId = await requireClerkUserId();
          const wallet = await ensureClerkUserWalletSynced(clerkId);
          const credits = await syncWalletCreditsForUser(
            clerkId,
            wallet.unifiedBalance.totalUsdc,
          );

          return Response.json(
            {
              userId: clerkId,
              walletId: wallet.circleWalletId,
              address: wallet.address,
              ledgerBalance: credits.ledgerBalance,
              spendableCreditsUsdc: credits.spendableCreditsUsdc,
              settlementHoldUsdc: credits.holdUsdc,
              onChainUsdc: wallet.unifiedBalance.totalUsdc,
              unifiedBalance: wallet.unifiedBalance,
            },
            { status: 201 },
          );
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            return unauthorizedJsonResponse();
          }
          console.error("[POST /api/wallet]", error);
          return Response.json(
            { error: error instanceof Error ? error.message : "Wallet provisioning error" },
            { status: 500 },
          );
        }
      },

      GET: async () => {
        try {
          if (!circleRuntimeReady()) {
            return Response.json(
              { error: "Circle is not configured. Set env vars from .env.local.example." },
              { status: 503 },
            );
          }

          const clerkId = await requireClerkUserId();
          const env = getServerEnv();

          const wallet = await ensureClerkUserWalletSynced(clerkId);
          const credits = await syncWalletCreditsForUser(
            clerkId,
            wallet.unifiedBalance.totalUsdc,
          );

          const preferredChainId = defaultPaymentChainId(env.CIRCLE_API_KEY);
          const preferredNetwork =
            preferredChainId === BASE_NETWORK.id ? BASE_NETWORK : ARC_NETWORK;
          const user = userStore.getByClerkId(clerkId);

          return Response.json({
            userId: clerkId,
            walletId: wallet.circleWalletId,
            address: wallet.address,
            ledgerBalance: credits.ledgerBalance,
            spendableCreditsUsdc: credits.spendableCreditsUsdc,
            settlementHoldUsdc: credits.holdUsdc,
            onChainUsdc: wallet.unifiedBalance.totalUsdc,
            unifiedBalance: wallet.unifiedBalance,
            preferredChainId,
            usdcContractAddress: preferredNetwork.usdcContractAddress,
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
            network: preferredNetwork,
            transactions: user?.transactions ?? [],
          });
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            return unauthorizedJsonResponse();
          }
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
