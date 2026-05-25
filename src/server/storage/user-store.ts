import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Transaction } from "@/lib/mock-data";
import { getDb, withImmediateTransaction } from "@/server/db/client";
import { ledgerEntries, users } from "@/server/db/schema";
import { microToUsdc, usdcToMicro } from "@/server/db/usdc";

/** Clerk user id — stored in SQLite column `user_id` (equivalent to clerkId). */
export type ClerkId = string;

export type UserRecord = {
  /** Clerk user id (`users.user_id`) */
  userId: ClerkId;
  circleWalletId: string;
  address: string;
  ledgerBalance: number;
  transactions: Transaction[];
};

export type DebitResult = {
  record: UserRecord;
  ledgerEntryId: string;
};

export class UserStoreError extends Error {
  constructor(
    message: string,
    readonly code:
      | "USER_NOT_FOUND"
      | "INSUFFICIENT_BALANCE"
      | "DUPLICATE_PAYMENT" = "USER_NOT_FOUND",
  ) {
    super(message);
    this.name = "UserStoreError";
  }
}

const TX_HISTORY_LIMIT = 100;

function rowToUserRecord(
  row: typeof users.$inferSelect,
  transactions: Transaction[],
): UserRecord {
  return {
    userId: row.userId,
    circleWalletId: row.circleWalletId,
    address: row.address,
    ledgerBalance: microToUsdc(row.ledgerBalanceMicroUsdc),
    transactions,
  };
}

function fetchLedgerHistory(clerkId: ClerkId): Transaction[] {
  const db = getDb();
  const rows = db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.userId, clerkId))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(TX_HISTORY_LIMIT)
    .all();

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    amount: microToUsdc(row.amountMicroUsdc),
    agent: row.agentId ?? undefined,
    timestamp: "just now",
    kind: row.kind,
  }));
}

function loadUserRecord(clerkId: ClerkId): UserRecord | undefined {
  const db = getDb();
  const row = db.select().from(users).where(eq(users.userId, clerkId)).get();
  if (!row) return undefined;
  return rowToUserRecord(row, fetchLedgerHistory(clerkId));
}

export const userStore = {
  getByUserId(clerkId: ClerkId): UserRecord | undefined {
    return loadUserRecord(clerkId);
  },

  /** @alias getByUserId — Clerk id is the primary key */
  getByClerkId(clerkId: ClerkId): UserRecord | undefined {
    return loadUserRecord(clerkId);
  },

  requireByClerkId(clerkId: ClerkId): UserRecord {
    const row = loadUserRecord(clerkId);
    if (!row) {
      console.error(
        `[user-store] User chưa được đồng bộ vào Database (SQLite): clerkId=${clerkId}`,
      );
      throw new UserStoreError(
        "User chưa được đồng bộ vào Database. Mở Wallet & Billing để đồng bộ.",
        "USER_NOT_FOUND",
      );
    }
    return row;
  },

  getByWalletId(walletId: string): UserRecord | undefined {
    const db = getDb();
    const row = db
      .select()
      .from(users)
      .where(eq(users.circleWalletId, walletId))
      .get();
    if (!row) return undefined;
    return rowToUserRecord(row, fetchLedgerHistory(row.userId));
  },

  /**
   * Upsert user after Circle wallet provisioning (clerkId + circleWalletId + ledger).
   */
  upsertFromClerk(params: {
    clerkId: ClerkId;
    circleWalletId: string;
    address: string;
    ledgerBalance: number;
  }): UserRecord {
    const now = new Date();
    const micro = usdcToMicro(params.ledgerBalance);

    return withImmediateTransaction(() => {
      const db = getDb();
      const existing = db
        .select()
        .from(users)
        .where(eq(users.userId, params.clerkId))
        .get();

      if (existing) {
        db.update(users)
          .set({
            circleWalletId: params.circleWalletId,
            address: params.address,
            ledgerBalanceMicroUsdc: micro,
            updatedAt: now,
          })
          .where(eq(users.userId, params.clerkId))
          .run();
      } else {
        db.insert(users)
          .values({
            userId: params.clerkId,
            circleWalletId: params.circleWalletId,
            address: params.address,
            ledgerBalanceMicroUsdc: micro,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      const saved = loadUserRecord(params.clerkId);
      if (!saved) {
        throw new UserStoreError(
          `Failed to persist user after upsert: clerkId=${params.clerkId}`,
          "USER_NOT_FOUND",
        );
      }
      return saved;
    });
  },

  createPlaceholder(clerkId: ClerkId, circleWalletId: string, address: string): UserRecord {
    return userStore.upsertFromClerk({
      clerkId,
      circleWalletId,
      address,
      ledgerBalance: 0,
    });
  },

  /**
   * When user deposits USDC to their Circle wallet on-chain, credit SQLite ledger up to that total.
   * Never decreases ledger (avoids “double deduction” when settlement lags behind debits).
   */
  /**
   * @param onChainTotalUsdc — Circle wallet USDC total
   * @param onChainHoldUsdc — already debited in SQLite but not yet transferred on-chain
   */
  reconcileDepositsFromOnChain(
    clerkId: ClerkId,
    onChainTotalUsdc: number,
    onChainHoldUsdc = 0,
  ): UserRecord {
    const user = loadUserRecord(clerkId);
    if (!user) {
      throw new UserStoreError(
        "User chưa được đồng bộ vào Database. Mở Wallet & Billing để đồng bộ.",
        "USER_NOT_FOUND",
      );
    }
    const epsilon = 0.000_001;
    const syncable = Math.max(0, onChainTotalUsdc - Math.max(0, onChainHoldUsdc));
    if (syncable <= user.ledgerBalance + epsilon) {
      if (user.ledgerBalance > syncable + 0.01) {
        return userStore.syncLedgerFromOnChain(clerkId, syncable);
      }
      return user;
    }
    const delta = syncable - user.ledgerBalance;
    return userStore.credit(clerkId, delta, "Nạp USDC · đồng bộ từ ví on-chain");
  },

  /**
   * Overwrite ledger from on-chain Circle unified balance (admin / legacy — prefer reconcileDepositsFromOnChain).
   */
  syncLedgerFromOnChain(clerkId: ClerkId, onChainTotalUsdc: number): UserRecord {
    const micro = usdcToMicro(onChainTotalUsdc);

    return withImmediateTransaction(() => {
      const db = getDb();
      const existing = db.select().from(users).where(eq(users.userId, clerkId)).get();
      if (!existing) {
        console.error(
          `[user-store] User chưa được đồng bộ vào Database: clerkId=${clerkId}`,
        );
        throw new UserStoreError(
          "User chưa được đồng bộ vào Database. Mở Wallet & Billing để đồng bộ.",
          "USER_NOT_FOUND",
        );
      }

      const updated = db
        .update(users)
        .set({
          ledgerBalanceMicroUsdc: micro,
          updatedAt: new Date(),
        })
        .where(eq(users.userId, clerkId))
        .returning()
        .all();

      if (updated.length === 0) {
        throw new UserStoreError(
          `User chưa được đồng bộ vào Database: clerkId=${clerkId}`,
          "USER_NOT_FOUND",
        );
      }

      return rowToUserRecord(updated[0]!, fetchLedgerHistory(clerkId));
    });
  },

  debit(
    clerkId: ClerkId,
    amount: number,
    meta: { label: string; agentId?: string; idempotencyKey?: string },
  ): DebitResult {
    const amountMicro = usdcToMicro(amount);

    return withImmediateTransaction(() => {
      const db = getDb();

      if (meta.idempotencyKey) {
        const prior = db
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.idempotencyKey, meta.idempotencyKey))
          .get();
        if (prior) {
          throw new UserStoreError(
            "Thanh toán này đã được ghi nhận (trùng yêu cầu). Không trừ thêm lần nữa.",
            "DUPLICATE_PAYMENT",
          );
        }
      }

      const locked = db.select().from(users).where(eq(users.userId, clerkId)).get();
      if (!locked) {
        console.error(
          `[user-store.debit] User chưa được đồng bộ vào Database: clerkId=${clerkId}`,
        );
        throw new UserStoreError(
          "User chưa được đồng bộ vào Database. Mở Wallet & Billing để đồng bộ.",
          "USER_NOT_FOUND",
        );
      }

      const updated = db
        .update(users)
        .set({
          ledgerBalanceMicroUsdc: sql`${users.ledgerBalanceMicroUsdc} - ${amountMicro}`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(users.userId, clerkId), gte(users.ledgerBalanceMicroUsdc, amountMicro)),
        )
        .returning()
        .all();

      if (updated.length === 0) {
        throw new UserStoreError("Insufficient ledger balance", "INSUFFICIENT_BALANCE");
      }

      const entryId = `tx-${Date.now()}-${randomUUID().slice(0, 8)}`;
      db.insert(ledgerEntries)
        .values({
          id: entryId,
          userId: clerkId,
          kind: "nanopayment",
          label: meta.label,
          amountMicroUsdc: -amountMicro,
          agentId: meta.agentId ?? null,
          idempotencyKey: meta.idempotencyKey ?? null,
          createdAt: new Date(),
        })
        .run();

      return {
        record: rowToUserRecord(updated[0]!, fetchLedgerHistory(clerkId)),
        ledgerEntryId: entryId,
      };
    });
  },

  credit(clerkId: ClerkId, amount: number, label: string): UserRecord {
    const amountMicro = usdcToMicro(amount);

    return withImmediateTransaction(() => {
      const db = getDb();
      const locked = db.select().from(users).where(eq(users.userId, clerkId)).get();
      if (!locked) {
        console.error(
          `[user-store.credit] User chưa được đồng bộ vào Database: clerkId=${clerkId}`,
        );
        throw new UserStoreError(
          "User chưa được đồng bộ vào Database.",
          "USER_NOT_FOUND",
        );
      }

      const updated = db
        .update(users)
        .set({
          ledgerBalanceMicroUsdc: sql`${users.ledgerBalanceMicroUsdc} + ${amountMicro}`,
          updatedAt: new Date(),
        })
        .where(eq(users.userId, clerkId))
        .returning()
        .all();

      const entryId = `tx-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const isRefund = /hoàn tiền|refund/i.test(label);
      db.insert(ledgerEntries)
        .values({
          id: entryId,
          userId: clerkId,
          kind: isRefund ? "refund" : "deposit",
          label,
          amountMicroUsdc: amountMicro,
          createdAt: new Date(),
        })
        .run();

      return rowToUserRecord(updated[0]!, fetchLedgerHistory(clerkId));
    });
  },
};
