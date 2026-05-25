/**
 * Steps 2–3: Create wallet sets, master DCW wallet, and x402 signing key.
 * Run: npm run setup:wallets
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { generatePrivateKey } from "viem/accounts";
import { dcwBlockchainsForApiKey } from "../src/lib/circle-dcw-blockchains";
import { initializeMasterAgentWallet } from "../src/services/masterAgent";

const USER_WALLET_SET_NAME = "bookanai-users";
const PLACEHOLDER = /your-|placeholder|0000000000000000000000000000000000000000000000000000000000000000/i;

function loadEnvLocal(): Record<string, string> {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) {
    console.error("Missing .env.local");
    process.exit(1);
  }
  const vars: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    vars[key] = val;
    if (!process.env[key]) process.env[key] = val;
  }
  return vars;
}

function patchEnvLocal(updates: Record<string, string>): void {
  const path = resolve(process.cwd(), ".env.local");
  let content = readFileSync(path, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  writeFileSync(path, content, "utf8");
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  return PLACEHOLDER.test(value);
}

const vars = loadEnvLocal();
const apiKey = vars.CIRCLE_API_KEY ?? process.env.CIRCLE_API_KEY;
const entitySecret = vars.ENTITY_SECRET ?? process.env.ENTITY_SECRET;

if (!apiKey || !entitySecret) {
  console.error("CIRCLE_API_KEY and ENTITY_SECRET required in .env.local");
  process.exit(1);
}

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const updates: Record<string, string> = {};

// --- User wallet set (CIRCLE_WALLET_SET_ID) ---
let userWalletSetId = vars.CIRCLE_WALLET_SET_ID;
if (isPlaceholder(userWalletSetId)) {
  console.log("Creating user wallet set…");
  const res = await client.createWalletSet({
    name: USER_WALLET_SET_NAME,
    idempotencyKey: randomUUID(),
  });
  userWalletSetId = res.data?.walletSet?.id;
  if (!userWalletSetId) {
    console.error("createWalletSet failed for users — no id returned");
    process.exit(1);
  }
  updates.CIRCLE_WALLET_SET_ID = userWalletSetId;
  console.log(`CIRCLE_WALLET_SET_ID=${userWalletSetId}`);
  patchEnvLocal({ CIRCLE_WALLET_SET_ID: userWalletSetId });
} else {
  console.log("CIRCLE_WALLET_SET_ID already set — skipping user wallet set creation.");
}

// --- Master DCW wallet ---
let masterWalletSetId = vars.MASTER_WALLET_SET_ID;
let masterWalletId = vars.MASTER_CIRCLE_WALLET_ID;

if (isPlaceholder(masterWalletSetId) || isPlaceholder(masterWalletId)) {
  const chains = dcwBlockchainsForApiKey(apiKey);
  console.log(`Initializing master system wallet (${chains.join(" + ")})…`);
  try {
    const master = await initializeMasterAgentWallet();
    masterWalletSetId = master.walletSetId;
    masterWalletId = master.walletId;
    updates.MASTER_WALLET_SET_ID = master.walletSetId;
    updates.MASTER_CIRCLE_WALLET_ID = master.walletId;
    console.log(`MASTER_WALLET_SET_ID=${master.walletSetId}`);
    console.log(`MASTER_CIRCLE_WALLET_ID=${master.walletId}`);
    console.log(`Master DCW address=${master.address}`);
  } catch (error) {
    const err = error as { response?: { data?: unknown }; message?: string };
    const detail = err.response?.data
      ? JSON.stringify(err.response.data)
      : (err.message ?? String(error));
    console.error("Master wallet init failed:", detail);
    process.exit(1);
  }
} else {
  console.log("Master wallet ids already set — skipping master wallet creation.");
}

// --- x402 Gateway signing key (not from Circle) ---
let masterPk = vars.MASTER_AGENT_PRIVATE_KEY;
if (isPlaceholder(masterPk)) {
  masterPk = generatePrivateKey();
  updates.MASTER_AGENT_PRIVATE_KEY = masterPk;
  const { privateKeyToAccount } = await import("viem/accounts");
  const x402Address = privateKeyToAccount(masterPk as `0x${string}`).address;
  console.log("Generated MASTER_AGENT_PRIVATE_KEY — fund x402 Gateway EOA:");
  console.log(`  ${x402Address}`);
} else {
  console.log("MASTER_AGENT_PRIVATE_KEY already set — skipping generation.");
}

if (Object.keys(updates).length > 0) {
  patchEnvLocal(updates);
  console.log("\nUpdated .env.local with new values.");
} else {
  console.log("\nNo .env.local changes needed.");
}

console.log("\nNext:");
console.log("  1. npm run show:x402  — address for x402 Gateway USDC (NOT the DCW 0x555a… address)");
console.log("  2. Fund that x402 EOA with USDC on Base (LIVE key = mainnet only)");
console.log("  3. npm run db:migrate");
console.log("  4. npm run dev");
