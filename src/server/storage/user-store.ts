import type { Transaction } from "@/lib/mock-data";

export type UserRecord = {
  userId: string;
  circleWalletId: string;
  address: string;
  ledgerBalance: number;
  transactions: Transaction[];
};

const users = new Map<string, UserRecord>();
const byWalletId = new Map<string, UserRecord>();

const INITIAL_BALANCE = 15.5;

export const userStore = {
  getByUserId(userId: string): UserRecord | undefined {
    return users.get(userId);
  },

  getByWalletId(walletId: string): UserRecord | undefined {
    return byWalletId.get(walletId);
  },

  upsert(record: UserRecord): UserRecord {
    users.set(record.userId, record);
    byWalletId.set(record.circleWalletId, record);
    return record;
  },

  createPlaceholder(userId: string, circleWalletId: string, address: string): UserRecord {
    const existing = users.get(userId);
    if (existing) return existing;

    const record: UserRecord = {
      userId,
      circleWalletId,
      address,
      ledgerBalance: INITIAL_BALANCE,
      transactions: [],
    };
    return this.upsert(record);
  },

  debit(
    userId: string,
    amount: number,
    meta: { label: string; agentId?: string },
  ): UserRecord {
    const user = users.get(userId);
    if (!user) throw new Error(`User not found: ${userId}`);
    if (user.ledgerBalance < amount) {
      throw new Error("Insufficient ledger balance");
    }
    user.ledgerBalance -= amount;
    user.transactions.unshift({
      id: `tx-${Date.now()}`,
      label: meta.label,
      amount: -amount,
      agent: meta.agentId,
      timestamp: "just now",
      kind: "nanopayment",
    });
    return user;
  },

  credit(userId: string, amount: number, label: string): UserRecord {
    const user = users.get(userId);
    if (!user) throw new Error(`User not found: ${userId}`);
    user.ledgerBalance += amount;
    user.transactions.unshift({
      id: `tx-${Date.now()}`,
      label,
      amount,
      timestamp: "just now",
      kind: "deposit",
    });
    return user;
  },

  /** Keeps in-app credits aligned with Circle Gateway unified USDC total. */
  syncLedgerFromUnified(userId: string, totalUsdc: number): UserRecord {
    const user = users.get(userId);
    if (!user) throw new Error(`User not found: ${userId}`);
    user.ledgerBalance = totalUsdc;
    return user;
  },
};
