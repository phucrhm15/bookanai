import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { SupportedChainId } from "@/lib/chains";
import { getDb } from "@/server/db/client";
import { pendingOnchainSettlements } from "@/server/db/schema";
import { ledgerLabelRefundHold, ledgerLabelRefundPending } from "@/server/ledger-label-keys";
import { microToUsdc, usdcToMicro } from "@/server/db/usdc";
import { executeUserToMasterTransfer } from "@/server/services/usdc-transfer";

const BATCH_LIMIT = 20;
const MAX_ATTEMPTS = 5;
/** Reserved rows older than this are treated as crashed mid-payment → refund + release hold. */
const STALE_RESERVED_MS = 5 * 60 * 1000;

const ACTIVE_HOLD_STATUSES = ["reserved", "pending", "submitted"] as const;

export type StaleReservedRelease = {
  released: number;
  refundedUsdc: number;
};

export type RepairSettlementHoldsResult = StaleReservedRelease & {
  completedGhost: number;
};

/** USDC still on-chain but already debited in SQLite (awaiting user→x402 payer transfer). */
export function getOnchainSettlementHoldUsdc(userId: string): number {
  const db = getDb();
  const row = db
    .select({
      totalMicro: sql<number>`coalesce(sum(${pendingOnchainSettlements.amountMicroUsdc}), 0)`,
    })
    .from(pendingOnchainSettlements)
    .where(
      and(
        eq(pendingOnchainSettlements.userId, userId),
        inArray(pendingOnchainSettlements.status, [...ACTIVE_HOLD_STATUSES]),
      ),
    )
    .get();

  return microToUsdc(Number(row?.totalMicro ?? 0));
}

export function reserveOnchainSettlement(input: {
  ledgerEntryId: string;
  userId: string;
  circleWalletId: string;
  amountUsdc: number;
  targetChainId: SupportedChainId;
}): string {
  const id = `settle-${randomUUID()}`;
  const now = new Date();
  getDb()
    .insert(pendingOnchainSettlements)
    .values({
      id,
      ledgerEntryId: input.ledgerEntryId,
      userId: input.userId,
      circleWalletId: input.circleWalletId,
      amountMicroUsdc: usdcToMicro(input.amountUsdc),
      targetChainId: input.targetChainId,
      status: "reserved",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

export function activateOnchainSettlement(reservationId: string): void {
  const now = new Date();
  getDb()
    .update(pendingOnchainSettlements)
    .set({ status: "pending", updatedAt: now })
    .where(
      and(
        eq(pendingOnchainSettlements.id, reservationId),
        eq(pendingOnchainSettlements.status, "reserved"),
      ),
    )
    .run();
}

export function cancelOnchainSettlementForLedgerEntry(ledgerEntryId: string): void {
  getDb()
    .delete(pendingOnchainSettlements)
    .where(
      and(
        eq(pendingOnchainSettlements.ledgerEntryId, ledgerEntryId),
        eq(pendingOnchainSettlements.status, "reserved"),
      ),
    )
    .run();
}

/**
 * Unblocks spendable balance when a request died after debit+reserve (server restart / timeout).
 */
export async function releaseStaleReservedSettlements(
  userId?: string,
): Promise<StaleReservedRelease> {
  const { userStore } = await import("@/server/storage/user-store");
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_RESERVED_MS);

  const stale = db
    .select()
    .from(pendingOnchainSettlements)
    .where(
      userId
        ? and(
            eq(pendingOnchainSettlements.status, "reserved"),
            eq(pendingOnchainSettlements.userId, userId),
          )
        : eq(pendingOnchainSettlements.status, "reserved"),
    )
    .all()
    .filter((row) => row.updatedAt.getTime() < cutoff.getTime());

  let released = 0;
  let refundedUsdc = 0;

  for (const row of stale) {
    const amount = microToUsdc(row.amountMicroUsdc);
    cancelOnchainSettlementForLedgerEntry(row.ledgerEntryId);
    userStore.credit(
      row.userId,
      amount,
      ledgerLabelRefundPending(row.ledgerEntryId),
    );
    released++;
    refundedUsdc += amount;
    console.warn(
      `[settlement] Released stale reserved ${row.id} (${amount} USDC) for user ${row.userId}`,
    );
  }

  return { released, refundedUsdc };
}

/**
 * Fixes "đang giữ chuyển" > on-chain (orphan reserved + stale pending after transfers).
 * - reserved → cancel + refund (payment never finished)
 * - excess pending/submitted → mark complete (USDC likely already left the wallet on-chain)
 */
export async function repairSettlementHolds(
  userId: string,
  onChainUsdc: number,
): Promise<RepairSettlementHoldsResult> {
  const { userStore } = await import("@/server/storage/user-store");
  const db = getDb();
  const epsilon = 0.000_1;

  const active = db
    .select()
    .from(pendingOnchainSettlements)
    .where(
      and(
        eq(pendingOnchainSettlements.userId, userId),
        inArray(pendingOnchainSettlements.status, [...ACTIVE_HOLD_STATUSES]),
      ),
    )
    .all()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let released = 0;
  let refundedUsdc = 0;
  let completedGhost = 0;

  for (const row of active.filter((r) => r.status === "reserved")) {
    const amount = microToUsdc(row.amountMicroUsdc);
    cancelOnchainSettlementForLedgerEntry(row.ledgerEntryId);
    userStore.credit(row.userId, amount, ledgerLabelRefundHold(row.id));
    released++;
    refundedUsdc += amount;
    console.warn(`[settlement] Cleared reserved ${row.id} (+${amount} USDC refund)`);
  }

  let hold = getOnchainSettlementHoldUsdc(userId);
  if (hold <= onChainUsdc + epsilon) {
    return { released, refundedUsdc, completedGhost };
  }

  let excess = hold - onChainUsdc;
  const pendingRows = db
    .select()
    .from(pendingOnchainSettlements)
    .where(
      and(
        eq(pendingOnchainSettlements.userId, userId),
        inArray(pendingOnchainSettlements.status, ["pending", "submitted"]),
      ),
    )
    .all()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const now = new Date();
  for (const row of pendingRows) {
    if (excess <= epsilon) break;
    const amount = microToUsdc(row.amountMicroUsdc);
    db.update(pendingOnchainSettlements)
      .set({ status: "complete", updatedAt: now, lastError: "auto-closed: hold exceeded on-chain" })
      .where(eq(pendingOnchainSettlements.id, row.id))
      .run();
    completedGhost++;
    excess -= amount;
    console.warn(
      `[settlement] Closed stale pending ${row.id} (${amount} USDC) — hold was above on-chain`,
    );
  }

  return { released, refundedUsdc, completedGhost };
}

/** @deprecated Prefer reserve → activate flow from nanopayment. */
export function queueOnchainSettlement(input: {
  ledgerEntryId: string;
  userId: string;
  circleWalletId: string;
  amountUsdc: number;
  targetChainId: SupportedChainId;
}): string {
  const id = `settle-${randomUUID()}`;
  const now = new Date();
  getDb()
    .insert(pendingOnchainSettlements)
    .values({
      id,
      ledgerEntryId: input.ledgerEntryId,
      userId: input.userId,
      circleWalletId: input.circleWalletId,
      amountMicroUsdc: usdcToMicro(input.amountUsdc),
      targetChainId: input.targetChainId,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

export type BatchSettlementResult = {
  processed: number;
  completed: number;
  failed: number;
  submitted: number;
  details: { id: string; status: string; circleTransactionId?: string; error?: string }[];
};

/**
 * Processes queued user→master USDC transfers for one user (e.g. on Wallet page load).
 */
export async function processSettlementBatchForUser(
  userId: string,
): Promise<BatchSettlementResult> {
  const db = getDb();
  const pending = db
    .select()
    .from(pendingOnchainSettlements)
    .where(
      and(
        eq(pendingOnchainSettlements.userId, userId),
        inArray(pendingOnchainSettlements.status, ["pending", "submitted"]),
      ),
    )
    .limit(BATCH_LIMIT)
    .all();

  return processSettlementRows(pending);
}

/**
 * Processes queued user→master USDC transfers (not run inside user HTTP requests).
 */
export async function processSettlementBatch(): Promise<BatchSettlementResult> {
  const db = getDb();
  const pending = db
    .select()
    .from(pendingOnchainSettlements)
    .where(inArray(pendingOnchainSettlements.status, ["pending", "submitted"]))
    .limit(BATCH_LIMIT)
    .all();

  return processSettlementRows(pending);
}

async function processSettlementRows(
  pending: (typeof pendingOnchainSettlements.$inferSelect)[],
): Promise<BatchSettlementResult> {
  const db = getDb();
  const result: BatchSettlementResult = {
    processed: 0,
    completed: 0,
    failed: 0,
    submitted: 0,
    details: [],
  };

  for (const row of pending) {
    result.processed++;
    const now = new Date();

    if (row.status === "submitted" && row.circleTransactionId) {
      result.details.push({
        id: row.id,
        status: "submitted",
        circleTransactionId: row.circleTransactionId,
      });
      continue;
    }

    try {
      const circleTransactionId = await executeUserToMasterTransfer(
        row.circleWalletId,
        microToUsdc(row.amountMicroUsdc),
        row.targetChainId as SupportedChainId,
      );

      db.update(pendingOnchainSettlements)
        .set({
          status: "complete",
          circleTransactionId,
          updatedAt: now,
        })
        .where(eq(pendingOnchainSettlements.id, row.id))
        .run();

      result.completed++;
      result.details.push({ id: row.id, status: "complete", circleTransactionId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = row.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;

      db.update(pendingOnchainSettlements)
        .set({
          status: failed ? "failed" : "pending",
          attempts,
          lastError: message.slice(0, 500),
          updatedAt: now,
        })
        .where(eq(pendingOnchainSettlements.id, row.id))
        .run();

      if (failed) result.failed++;
      result.details.push({ id: row.id, status: failed ? "failed" : "pending", error: message });
    }
  }

  return result;
}

export async function syncWalletCreditsForUser(
  userId: string,
  onChainTotalUsdc: number,
): Promise<{
  holdUsdc: number;
  ledgerBalance: number;
  spendableCreditsUsdc: number;
  settlementBatch: BatchSettlementResult;
  repair: RepairSettlementHoldsResult;
}> {
  await releaseStaleReservedSettlements(userId);
  const settlementBatch = await processSettlementBatchForUser(userId);
  const repair = await repairSettlementHolds(userId, onChainTotalUsdc);
  const holdUsdc = getOnchainSettlementHoldUsdc(userId);
  const { userStore } = await import("@/server/storage/user-store");
  const user = userStore.reconcileDepositsFromOnChain(userId, onChainTotalUsdc, holdUsdc);
  const spendableOnChain = Math.max(0, onChainTotalUsdc - holdUsdc);
  const spendableCreditsUsdc = Math.min(user.ledgerBalance, spendableOnChain);
  return {
    holdUsdc,
    ledgerBalance: user.ledgerBalance,
    spendableCreditsUsdc,
    settlementBatch,
    repair,
  };
}
