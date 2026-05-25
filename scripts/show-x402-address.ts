import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";

const path = resolve(process.cwd(), ".env.local");
if (!existsSync(path)) {
  console.error("Missing .env.local");
  process.exit(1);
}
for (const line of readFileSync(path, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const pk = process.env.MASTER_AGENT_PRIVATE_KEY;
if (!pk || /0{64}/.test(pk.replace(/^0x/, ""))) {
  console.error("MASTER_AGENT_PRIVATE_KEY is not set. Run: npm run setup:wallets");
  process.exit(1);
}

const account = privateKeyToAccount(pk as `0x${string}`);
console.log("X402 Gateway EOA (fund USDC here for marketplace payments):");
console.log(account.address);
console.log("\nCircle DCW master (on-chain reimbursement target, NOT x402 Gateway):");
console.log("Check MASTER_CIRCLE_WALLET_ID via npm run init:master");
