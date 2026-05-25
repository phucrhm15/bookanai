/**
 * Pre-deploy checklist — run locally before publishing.
 * Usage: npm run deploy:check
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const required = [
  "VITE_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CIRCLE_API_KEY",
  "ENTITY_SECRET",
  "CIRCLE_WALLET_SET_ID",
  "MASTER_AGENT_PRIVATE_KEY",
  "X402_DISCOVERY_URL",
] as const;

const recommended = ["SETTLEMENT_CRON_SECRET", "BASE_RPC_URL"] as const;

function mask(v: string): string {
  if (v.length <= 8) return "***";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

let failed = 0;

console.log("\n=== Nano.Agent deploy check ===\n");

for (const key of required) {
  const val = process.env[key]?.trim();
  if (!val || val.includes("your-") || val.includes("000000000000")) {
    console.log(`✗ ${key} — missing or placeholder`);
    failed++;
  } else {
    console.log(`✓ ${key} = ${mask(val)}`);
  }
}

for (const key of recommended) {
  const val = process.env[key]?.trim();
  if (!val) {
    console.log(`⚠ ${key} — not set (recommended for production)`);
  } else {
    console.log(`✓ ${key}`);
  }
}

const pk = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
if (pk.startsWith("pk_test_")) {
  console.log("\n⚠ Clerk is in TEST mode — switch to pk_live_ for public production.");
}

const master = process.env.MASTER_AGENT_PRIVATE_KEY ?? "";
if (master.startsWith("0x0000")) {
  console.log("✗ MASTER_AGENT_PRIVATE_KEY is still the example zero key.");
  failed++;
}

console.log("\nNext steps:");
console.log("  1. docker compose up --build   (VPS / Railway / Render Docker)");
console.log("  2. Point domain → HTTPS reverse proxy → port 3000");
console.log("  3. Clerk dashboard: add production URL + /sign-in /sign-up redirects");
console.log("  4. Cron: POST /api/cron/settle-batch with SETTLEMENT_CRON_SECRET");
console.log("  5. Fund Master x402 wallet: npm run show:x402\n");

if (failed > 0) {
  process.exit(1);
}

console.log("Ready to deploy (env looks configured).\n");
