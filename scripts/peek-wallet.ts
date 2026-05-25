import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getUnifiedBalance } from "../src/services/circleService";
import { userStore } from "../src/server/storage/user-store";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const walletId = process.argv[2] ?? "9c9739e2-6c60-5efc-bf0e-8d43124093b9";
const u = userStore.getByWalletId(walletId);
console.log("ledger", u?.ledgerBalance, "address", u?.address);
const unified = await getUnifiedBalance(walletId);
console.log("unified", JSON.stringify(unified));
