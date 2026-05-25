import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Core user ↔ Circle wallet mapping. Survives restarts; never use in-memory Maps.
 */
export const users = sqliteTable(
  "users",
  {
    userId: text("user_id").primaryKey(),
    circleWalletId: text("circle_wallet_id").notNull(),
    address: text("address").notNull(),
    /** USDC × 10^6 — avoids floating-point ledger drift */
    ledgerBalanceMicroUsdc: integer("ledger_balance_micro_usdc").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("users_circle_wallet_id_uidx").on(t.circleWalletId)],
);

export const ledgerEntryKind = ["nanopayment", "deposit", "refund", "withdraw"] as const;
export type LedgerEntryKind = (typeof ledgerEntryKind)[number];

/** Append-only ledger lines shown in wallet UI */
export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    kind: text("kind").$type<LedgerEntryKind>().notNull(),
    label: text("label").notNull(),
    /** Signed micro-USDC (negative = spend) */
    amountMicroUsdc: integer("amount_micro_usdc").notNull(),
    agentId: text("agent_id"),
    idempotencyKey: text("idempotency_key"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("ledger_entries_user_id_idx").on(t.userId),
    uniqueIndex("ledger_entries_idempotency_uidx").on(t.idempotencyKey),
  ],
);

/** Batched on-chain reimbursement (Step 2 — populated by cron, not HTTP) */
export const settlementBatchStatus = ["pending", "processing", "complete", "failed"] as const;

export const settlementBatches = sqliteTable("settlement_batches", {
  id: text("id").primaryKey(),
  status: text("status").$type<(typeof settlementBatchStatus)[number]>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const onchainSettlementStatus = [
  /** Ledger debited; on-chain transfer not started yet (prevents false deposit sync). */
  "reserved",
  "pending",
  "submitted",
  "complete",
  "failed",
] as const;

export const pendingOnchainSettlements = sqliteTable(
  "pending_onchain_settlements",
  {
    id: text("id").primaryKey(),
    ledgerEntryId: text("ledger_entry_id")
      .notNull()
      .references(() => ledgerEntries.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    circleWalletId: text("circle_wallet_id").notNull(),
    amountMicroUsdc: integer("amount_micro_usdc").notNull(),
    targetChainId: integer("target_chain_id").notNull(),
    batchId: text("batch_id").references(() => settlementBatches.id),
    status: text("status")
      .$type<(typeof onchainSettlementStatus)[number]>()
      .notNull()
      .default("pending"),
    circleTransactionId: text("circle_transaction_id"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("pending_settlements_ledger_entry_uidx").on(t.ledgerEntryId),
    index("pending_settlements_status_idx").on(t.status),
    index("pending_settlements_batch_id_idx").on(t.batchId),
  ],
);
