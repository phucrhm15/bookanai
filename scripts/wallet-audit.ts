import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const dbPath = resolve("data/bookanai.db");
const db = new Database(dbPath);

const users = db
  .prepare(
    `SELECT user_id, substr(address,1,14) AS addr, ledger_balance_micro_usdc/1e6 AS ledger
     FROM users`,
  )
  .all() as { user_id: string; addr: string; ledger: number }[];

console.log("=== Users ===");
for (const u of users) {
  console.log(u);
}

console.log("\n=== Ledger (newest first) ===");
const ledger = db
  .prepare(
    `SELECT datetime(created_at/1000, 'unixepoch', 'localtime') AS at,
            kind, round(amount_micro_usdc/1e6, 6) AS amt, label, agent_id
     FROM ledger_entries ORDER BY created_at DESC LIMIT 25`,
  )
  .all();
console.table(ledger);

console.log("\n=== Pending on-chain settlements ===");
const settlements = db
  .prepare(
    `SELECT status, round(amount_micro_usdc/1e6, 6) AS amt,
            substr(last_error,1,60) AS err, datetime(updated_at/1000, 'unixepoch', 'localtime') AS at
     FROM pending_onchain_settlements ORDER BY created_at DESC`,
  )
  .all();
console.table(settlements);

const sumNano = db
  .prepare(
    `SELECT round(coalesce(sum(-amount_micro_usdc),0)/1e6, 6) AS spent
     FROM ledger_entries WHERE kind = 'nanopayment'`,
  )
  .get() as { spent: number };
const sumRefund = db
  .prepare(
    `SELECT round(coalesce(sum(amount_micro_usdc),0)/1e6, 6) AS refunded
     FROM ledger_entries WHERE kind = 'refund'`,
  )
  .get() as { refunded: number };
const sumDeposit = db
  .prepare(
    `SELECT round(coalesce(sum(amount_micro_usdc),0)/1e6, 6) AS deposits
     FROM ledger_entries WHERE kind = 'deposit'`,
  )
  .get() as { deposits: number };

console.log("\n=== Totals (ledger) ===");
console.log({ deposits: sumDeposit.deposits, spent: sumNano.spent, refunded: sumRefund.refunded });

db.close();
