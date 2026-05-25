import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import type { TransactionState } from "@circle-fin/developer-controlled-wallets";
import {
  ARC_USDC_CONTRACT_ADDRESS,
  BASE_USDC_CONTRACT_ADDRESS,
  BASE_NETWORK,
  type SupportedChainId,
} from "@/lib/chains";
import { dcwBlockchainForPaymentChain } from "@/lib/circle-dcw-blockchains";
import {
  ONCHAIN_TRANSFER_POLL_INTERVAL_MS,
  ONCHAIN_TRANSFER_POLL_TIMEOUT_MS,
} from "@/server/config/api-timeouts";
import { getServerEnv } from "@/server/config/env";
import { userStore } from "@/server/storage/user-store";
import { CircleServiceError } from "@/services/circle-errors";
import { getMasterAgentAddress } from "@/services/masterAgent";

const TX_TERMINAL = new Set<TransactionState>([
  "COMPLETE",
  "FAILED",
  "DENIED",
  "CANCELLED",
]);

let dcwClient: ReturnType<typeof initiateDeveloperControlledWalletsClient> | undefined;

function getTransferClient() {
  if (!dcwClient) {
    const env = getServerEnv();
    dcwClient = initiateDeveloperControlledWalletsClient({
      apiKey: env.CIRCLE_API_KEY,
      entitySecret: env.ENTITY_SECRET,
    });
  }
  return dcwClient;
}

function formatUsdcAmount(amount: number): string {
  return amount.toFixed(6).replace(/\.?0+$/, "") || "0";
}

function formatCircleApiError(error: unknown): string {
  const err = error as {
    response?: { status?: number; data?: { message?: string; errors?: unknown[] } };
    message?: string;
  };
  if (err.response?.data?.message) {
    const parts = [err.response.data.message];
    if (err.response.data.errors?.length) {
      parts.push(JSON.stringify(err.response.data.errors));
    }
    return parts.join(" — ");
  }
  return err.message ?? String(error);
}

async function pollTransferUntilTerminal(transactionId: string): Promise<void> {
  const client = getTransferClient();
  const deadline = Date.now() + ONCHAIN_TRANSFER_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = await client.getTransaction({ id: transactionId });
    const state = response.data?.transaction?.state;
    if (state && TX_TERMINAL.has(state)) {
      if (state === "COMPLETE") return;
      throw new CircleServiceError(
        `User-to-master USDC transfer ended with state ${state}`,
        "SETTLEMENT_FAILED",
      );
    }
    await new Promise((r) => setTimeout(r, ONCHAIN_TRANSFER_POLL_INTERVAL_MS));
  }

  throw new CircleServiceError(
    `User-to-master USDC transfer timed out after ${ONCHAIN_TRANSFER_POLL_TIMEOUT_MS}ms`,
    "NETWORK_ERROR",
  );
}

export async function executeUserToMasterTransfer(
  userWalletId: string,
  amountUsdc: number,
  targetChainId: SupportedChainId,
): Promise<string> {
  const user = userStore.getByWalletId(userWalletId);
  if (!user) {
    throw new CircleServiceError(`Unknown user wallet id: ${userWalletId}`, "WALLET_NOT_FOUND");
  }

  const masterAddress = await getMasterAgentAddress();
  const tokenAddress =
    targetChainId === BASE_NETWORK.id ? BASE_USDC_CONTRACT_ADDRESS : ARC_USDC_CONTRACT_ADDRESS;
  const blockchain = dcwBlockchainForPaymentChain(targetChainId);
  const client = getTransferClient();

  let createResponse;
  try {
    createResponse = await client.createTransaction({
      walletAddress: user.address,
      blockchain: blockchain as "BASE",
      tokenAddress,
      destinationAddress: masterAddress,
      amount: [formatUsdcAmount(amountUsdc)],
      fee: {
        type: "level",
        config: { feeLevel: "MEDIUM" },
      },
      idempotencyKey: randomUUID(),
      refId: `bookanai-nanopay-${Date.now()}`,
    });
  } catch (error) {
    throw new CircleServiceError(
      `User-to-master transfer failed: ${formatCircleApiError(error)}`,
      "SETTLEMENT_FAILED",
    );
  }

  const transactionId = createResponse.data?.id;
  if (!transactionId) {
    throw new CircleServiceError(
      "Circle createTransaction did not return a transaction id",
      "SETTLEMENT_FAILED",
    );
  }

  await pollTransferUntilTerminal(transactionId);
  return transactionId;
}
