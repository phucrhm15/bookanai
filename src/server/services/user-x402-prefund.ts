/**
 * Pull USDC from the user's Circle wallet on-chain before x402 API calls.
 * Replaces post-pay settlement so runs are funded by Content Credits wallets, not admin float.
 */
import type { SupportedChainId } from "@/lib/chains";
import {
  activateOnchainSettlement,
  cancelOnchainSettlementForLedgerEntry,
  completeOnchainSettlementPrefunded,
  getOnchainSettlementHoldUsdc,
  reserveOnchainSettlement,
} from "@/server/services/onchain-settlement";
import { executeUserToMasterTransfer } from "@/server/services/usdc-transfer";
import { getUnifiedBalance } from "@/services/circleService";
import { CircleServiceError } from "@/services/circle-errors";

export type CollectUserUsdcResult = {
  settlementId: string;
  circleTransactionId?: string;
  transferredUsdc: number;
};

/**
 * Reserve ledger hold, transfer user → x402 payer EOA, mark settlement complete.
 * Must run after SQLite debit and before master-agent x402 pay.
 */
export async function collectUserUsdcForX402(params: {
  clerkId: string;
  userWalletId: string;
  ledgerEntryId: string;
  amountUsdc: number;
  targetChainId: SupportedChainId;
}): Promise<CollectUserUsdcResult> {
  const { clerkId, userWalletId, ledgerEntryId, amountUsdc, targetChainId } = params;

  if (amountUsdc <= 0) {
    throw new CircleServiceError("collectUserUsdcForX402: amount must be positive", "SETTLEMENT_FAILED");
  }

  const unified = await getUnifiedBalance(userWalletId);
  const holdBefore = getOnchainSettlementHoldUsdc(clerkId);
  const spendableOnChain = Math.max(0, unified.totalUsdc - holdBefore);
  const epsilon = 0.000_001;

  if (amountUsdc > spendableOnChain + epsilon) {
    throw new CircleServiceError(
      `Ví on-chain không đủ USDC để chi trả API (cần ${amountUsdc.toFixed(6)}, khả dụng ${spendableOnChain.toFixed(6)}). ` +
        `Nạp USDC Base vào ví Content Credits.`,
      "INSUFFICIENT_BALANCE",
    );
  }

  const settlementId = reserveOnchainSettlement({
    ledgerEntryId,
    userId: clerkId,
    circleWalletId: userWalletId,
    amountUsdc,
    targetChainId,
  });

  try {
    activateOnchainSettlement(settlementId);
    const circleTransactionId = await executeUserToMasterTransfer(
      userWalletId,
      amountUsdc,
      targetChainId,
    );
    completeOnchainSettlementPrefunded(settlementId, circleTransactionId);
    console.info(
      `[prefund] User→x402 ${amountUsdc.toFixed(6)} USDC (tx ${circleTransactionId}) settlement=${settlementId}`,
    );
    return { settlementId, circleTransactionId, transferredUsdc: amountUsdc };
  } catch (error) {
    cancelOnchainSettlementForLedgerEntry(ledgerEntryId);
    if (error instanceof CircleServiceError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new CircleServiceError(
      `Không thể chuyển USDC từ ví của bạn để trả API: ${message}`,
      "SETTLEMENT_FAILED",
    );
  }
}
