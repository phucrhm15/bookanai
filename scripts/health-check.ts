/**
 * Quick Circle + DB health check (no secrets logged).
 * Run: npm run health
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { getDb } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { isCircleConfigured, getServerEnv } from "../src/server/config/env";
import { initializeMasterAgentWallet, fetchMasterUsdcBalance } from "../src/services/masterAgent";
import { getOrCreateUserWallet, getUnifiedBalance } from "../src/services/circleService";

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnvLocal();

const issues: string[] = [];
const ok: string[] = [];

function fail(msg: string) {
  issues.push(msg);
}
function pass(msg: string) {
  ok.push(msg);
}

// Env
if (!isCircleConfigured()) {
  fail("Circle env invalid — check CIRCLE_API_KEY, ENTITY_SECRET, CIRCLE_WALLET_SET_ID, MASTER_AGENT_PRIVATE_KEY in .env.local");
} else {
  pass("Circle env schema OK");
  const env = getServerEnv();
  const keyType = env.CIRCLE_API_KEY.startsWith("LIVE_API_KEY")
    ? "LIVE (Base mainnet only)"
    : env.CIRCLE_API_KEY.startsWith("TEST_API_KEY")
      ? "TEST (testnets only)"
      : "unknown prefix";
  pass(`API key type: ${keyType}`);
  try {
    const x402 = privateKeyToAccount(env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`).address;
    pass(`x402 Gateway EOA: ${x402}`);
  } catch {
    fail("MASTER_AGENT_PRIVATE_KEY invalid hex");
  }
}

// DB
try {
  getDb();
  const count = getDb().select().from(users).all().length;
  pass(`SQLite OK (${count} user row(s))`);
} catch (e) {
  fail(`SQLite: ${e instanceof Error ? e.message : String(e)}`);
}

// Master DCW
try {
  const master = await initializeMasterAgentWallet();
  pass(`Master DCW: ${master.address} (walletId set)`);
  try {
    const bal = await fetchMasterUsdcBalance();
    pass(`Master DCW USDC (Arc token query): ${bal}`);
  } catch {
    pass("Master DCW balance fetch skipped or failed (LIVE key may only show Base balances)");
  }
} catch (e) {
  fail(`Master wallet: ${e instanceof Error ? e.message : String(e)}`);
}

// User wallet (requires signed: signed-in user — run health check with HEALTH_CHECK_USER_ID if needed)
const healthCheckUserId = process.env.HEALTH_CHECK_USER_ID?.trim();
if (healthCheckUserId) {
  try {
    const wallet = await getOrCreateUserWallet(healthCheckUserId);
    pass(`Health-check user wallet (${healthCheckUserId}): ${wallet.address}`);
    const unified = await getUnifiedBalance(wallet.circleWalletId);
    pass(`Health-check unified USDC: ${unified.totalUsdc}`);
  } catch (e) {
    fail(`User wallet: ${e instanceof Error ? e.message : String(e)}`);
  }
} else {
  pass("User wallet check skipped (set HEALTH_CHECK_USER_ID to test a Clerk user id)");
}

console.log("\n=== OK ===");
for (const m of ok) console.log("  ✓", m);
if (issues.length) {
  console.log("\n=== ISSUES ===");
  for (const m of issues) console.log("  ✗", m);
  process.exit(1);
}
console.log("\nAll checks passed.");
