import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import {
  getOnchainSettlementHoldUsdc,
  releaseStaleReservedSettlements,
} from "../src/server/services/onchain-settlement";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const result = await releaseStaleReservedSettlements();
console.log("Released stale reserved:", result);

const db = new Database(resolve("data/bookanai.db"));
const users = db
  .prepare("SELECT user_id, ledger_balance_micro_usdc/1e6 AS ledger FROM users")
  .all() as { user_id: string; ledger: number }[];

console.log("\nUser ledgers:");
for (const u of users) {
  const hold = getOnchainSettlementHoldUsdc(u.user_id);
  console.log(`  ${u.user_id} ledger=${u.ledger} hold=${hold}`);
}

const settlements = db
  .prepare(
    "SELECT status, amount_micro_usdc/1e6 AS amt, last_error FROM pending_onchain_settlements",
  )
  .all();
console.log("\nPending settlements:", settlements);
