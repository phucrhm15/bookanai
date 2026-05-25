/**
 * One-time: initialize Master wallet and print ids for .env.local
 * Run: npm run init:master
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  getMasterAgentStatus,
  initializeMasterAgentWallet,
  isMasterAgentConfigured,
} from "../src/services/masterAgent";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) {
    console.warn("Missing .env.local — copy from .env.local.example first.\n");
    return;
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

if (!isMasterAgentConfigured()) {
  console.error("Set CIRCLE_API_KEY and ENTITY_SECRET in .env.local");
  process.exit(1);
}

try {
  const cache = await initializeMasterAgentWallet();
  console.log("Master wallet ready:");
  console.log(JSON.stringify(cache, null, 2));
} catch (error) {
  console.error("Init failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}

const status = await getMasterAgentStatus();
console.log("\nStatus:");
console.log(JSON.stringify(status, null, 2));
console.log("\nAdd to .env.local if empty:");
console.log(`MASTER_WALLET_SET_ID=${status.walletSetId ?? ""}`);
console.log(`MASTER_CIRCLE_WALLET_ID=${status.walletId ?? ""}`);
