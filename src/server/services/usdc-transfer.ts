import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import type { TransactionState } from "@circle-fin/developer-controlled-wallets";
import {
  ARC_CHAIN_ID,
  ARC_USDC_CONTRACT_ADDRESS,
  BASE_USDC_CONTRACT_ADDRESS,
  BASE_NETWORK,
  type SupportedChainId,
} from "@/lib/chains";
import {
  ARC_MEMO_CONTRACT_ADDRESS,
  ARC_MULTICALL3_FROM_ADDRESS,
  arcExtensionsActive,
  buildArcNanopaymentMemo,
  encodeArcBatchAggregate3ValueCalldata,
  encodeArcMemoBytes,
  formatNativeUsdcForDcw,
  type ArcBatchTransferItem,
  type ArcNanopaymentMemo,
} from "@/lib/arc-transaction-extensions";
import { dcwBlockchainForPaymentChain } from "@/lib/circle-dcw-blockchains";
import {
  ONCHAIN_TRANSFER_POLL_INTERVAL_MS,
  ONCHAIN_TRANSFER_POLL_TIMEOUT_MS,
} from "@/server/config/api-timeouts";
import { getServerEnv } from "@/server/config/env";
import { userStore } from "@/server/storage/user-store";
import { CircleServiceError } from "@/services/circle-errors";
import { getMasterX402DepositorAddress } from "@/server/services/x402-master-pay";

const TX_TERMINAL = new Set<TransactionState>([
  "COMPLETE",
  "CONFIRMED",
  "FAILED",
  "DENIED",
  "CANCELLED",
]);

const TX_SUCCESS = new Set<TransactionState>(["COMPLETE", "CONFIRMED"]);

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
      if (state && TX_SUCCESS.has(state)) return;
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

async function submitDcwContractExecution(input: {
  walletId: string;
  contractAddress: string;
  refId: string;
  nativeAmountUsdc?: number;
  abiFunctionSignature?: string;
  abiParameters?: string[];
  callData?: `0x${string}`;
}): Promise<string> {
  const client = getTransferClient();
  let createResponse;
  try {
    createResponse = await client.createContractExecutionTransaction({
      walletId: input.walletId,
      contractAddress: input.contractAddress,
      ...(input.callData
        ? { callData: input.callData }
        : {
            abiFunctionSignature: input.abiFunctionSignature!,
            abiParameters: input.abiParameters!,
          }),
      ...(input.nativeAmountUsdc != null && input.nativeAmountUsdc > 0
        ? { amount: formatNativeUsdcForDcw(input.nativeAmountUsdc) }
        : {}),
      fee: {
        type: "level",
        config: { feeLevel: "MEDIUM" },
      },
      idempotencyKey: randomUUID(),
      refId: input.refId,
    });
  } catch (error) {
    throw new CircleServiceError(
      `Arc contract execution failed: ${formatCircleApiError(error)}`,
      "SETTLEMENT_FAILED",
    );
  }

  const transactionId = createResponse.data?.id;
  if (!transactionId) {
    throw new CircleServiceError(
      "Circle createContractExecutionTransaction did not return a transaction id",
      "SETTLEMENT_FAILED",
    );
  }

  await pollTransferUntilTerminal(transactionId);
  return transactionId;
}

export type ArcTransferMemoContext = {
  ledgerEntryId: string;
  agentId?: string;
  settlementId?: string;
  batchId?: string;
};

async function executeArcMemoTransfer(
  userWalletId: string,
  amountUsdc: number,
  destinationAddress: `0x${string}`,
  memoContext: ArcTransferMemoContext,
): Promise<string> {
  const memo = buildArcNanopaymentMemo({
    ledgerEntryId: memoContext.ledgerEntryId,
    agentId: memoContext.agentId,
    settlementId: memoContext.settlementId,
    batchId: memoContext.batchId,
  });

  return submitDcwContractExecution({
    walletId: userWalletId,
    contractAddress: ARC_MEMO_CONTRACT_ADDRESS,
    abiFunctionSignature: "sendWithMemo(address,uint256,bytes)",
    abiParameters: [
      destinationAddress,
      usdcToErc20AtomicString(amountUsdc),
      encodeArcMemoBytes(memo),
    ],
    nativeAmountUsdc: amountUsdc,
    refId: `bookanai-arc-memo-${memoContext.ledgerEntryId}`,
  });
}

function usdcToErc20AtomicString(amountUsdc: number): string {
  return Math.round(amountUsdc * 1_000_000).toString();
}

/** Arc v0.7.2 — batch multiple memo transfers in one Multicall3From transaction. */
export async function executeArcBatchMemoTransfers(
  userWalletId: string,
  items: ArcBatchTransferItem[],
  batchId: string,
): Promise<string> {
  if (items.length === 0) {
    throw new CircleServiceError("Arc batch transfer: empty items", "SETTLEMENT_FAILED");
  }

  const { callData, totalNativeWei } = encodeArcBatchAggregate3ValueCalldata(
    items.map((item) => ({
      ...item,
      memo: {
        ...item.memo,
        batch: batchId,
      },
    })),
  );

  const totalUsdc = items.reduce((sum, i) => sum + i.amountUsdc, 0);

  return submitDcwContractExecution({
    walletId: userWalletId,
    contractAddress: ARC_MULTICALL3_FROM_ADDRESS,
    callData,
    nativeAmountUsdc: Number(totalNativeWei) / 1e18,
    refId: `bookanai-arc-batch-${batchId}`,
  });
}

export async function executeUserToMasterTransfer(
  userWalletId: string,
  amountUsdc: number,
  targetChainId: SupportedChainId,
  memoContext?: ArcTransferMemoContext,
): Promise<string> {
  const user = userStore.getByWalletId(userWalletId);
  if (!user) {
    throw new CircleServiceError(`Unknown user wallet id: ${userWalletId}`, "WALLET_NOT_FOUND");
  }

  const x402PayerAddress = getMasterX402DepositorAddress() as `0x${string}`;

  if (arcExtensionsActive(targetChainId) && memoContext) {
    return executeArcMemoTransfer(userWalletId, amountUsdc, x402PayerAddress, memoContext);
  }

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
      destinationAddress: x402PayerAddress,
      amount: [formatUsdcAmount(amountUsdc)],
      fee: {
        type: "level",
        config: { feeLevel: "MEDIUM" },
      },
      idempotencyKey: randomUUID(),
      refId: memoContext
        ? `bookanai-nanopay-${memoContext.ledgerEntryId}`
        : `bookanai-nanopay-${Date.now()}`,
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

export function isArcTransferChain(chainId: SupportedChainId): boolean {
  return chainId === ARC_CHAIN_ID;
}

export type { ArcNanopaymentMemo, ArcBatchTransferItem };
