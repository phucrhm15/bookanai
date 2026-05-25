/**
 * Look up Circle wallet IDs + balances for addresses (local DB + Circle API).
 * Usage: node scripts/lookup-wallet-addresses.mjs 0xAddr1 0xAddr2 ...
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { createPublicClient, formatUnits, http } from "viem";
import { base } from "viem/chains";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const require = createRequire(import.meta.url);

const envPath = resolve(".env.local");
if (!existsSync(envPath)) {
  console.error("Missing .env.local");
  process.exit(1);
}
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const addresses = process.argv.slice(2).map((a) => a.toLowerCase());
if (!addresses.length) {
  console.error("Usage: node scripts/lookup-wallet-addresses.mjs <0x...> [...]");
  process.exit(1);
}

const dbPath = resolve(
  process.env.DATABASE_URL?.replace(/^file:/, "") || "data/bookanai.db",
);

function loadSqliteRows() {
  if (!existsSync(dbPath)) {
    return { rows: [], error: `DB file not found: ${dbPath}` };
  }
  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath);
    const rows = db
      .prepare(
        "SELECT user_id, circle_wallet_id, address, ledger_balance_micro_usdc FROM users",
      )
      .all();
    db.close();
    return { rows, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint =
      msg.includes("NODE_MODULE_VERSION") || msg.includes("better_sqlite3")
        ? "Run: npm rebuild better-sqlite3 (or use Node 22 from package.json engines)"
        : msg;
    return { rows: [], error: hint };
  }
}

const { rows: dbRows, error: dbError } = loadSqliteRows();

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.ENTITY_SECRET,
});

const rpc = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const baseClient = createPublicClient({ chain: base, transport: http(rpc) });

async function erc20Balance(owner, token) {
  try {
    const bal = await baseClient.readContract({
      address: token,
      abi: [
        {
          name: "balanceOf",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        },
      ],
      functionName: "balanceOf",
      args: [owner],
    });
    return formatUnits(bal, 6);
  } catch (e) {
    return `error: ${e instanceof Error ? e.message : e}`;
  }
}

async function circleBalanceByWalletId(walletId) {
  try {
    const res = await client.getWalletTokenBalance({
      id: walletId,
      tokenAddresses: [BASE_USDC],
    });
    const rows = res.data?.tokenBalances ?? [];
    return rows.map((t) => `${t.token?.blockchain ?? "?"}: ${t.amount ?? "0"} USDC`).join(", ") || "0";
  } catch (e) {
    return `Circle API: ${e instanceof Error ? e.message : e}`;
  }
}

/** Paginate listWallets until address found (same wallet set). */
async function findCircleWalletIdByAddress(target) {
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  if (!walletSetId) return null;

  let pageAfter;
  for (let page = 0; page < 50; page++) {
    const res = await client.listWallets({
      walletSetId,
      pageSize: 50,
      ...(pageAfter ? { pageAfter } : {}),
    });
    const wallets = res.data?.wallets ?? [];
    for (const w of wallets) {
      if (w.address?.toLowerCase() === target) {
        return { id: w.id, state: w.state, blockchain: w.blockchain };
      }
    }
    pageAfter = res.data?.pagination?.nextPageAfter;
    if (!pageAfter || wallets.length === 0) break;
  }
  return null;
}

console.log("Wallet set:", process.env.CIRCLE_WALLET_SET_ID?.slice(0, 12) + "…");
console.log("Node:", process.version);
if (dbError) {
  console.log("DB:", dbPath, "— skipped:", dbError);
} else {
  console.log("DB:", dbPath, `${dbRows.length} user(s)`);
}
console.log("---");

for (const addr of addresses) {
  console.log(`\n${addr}`);
  const inDb = dbRows.find((r) => String(r.address).toLowerCase() === addr);
  if (inDb) {
    const ledger = Number(inDb.ledger_balance_micro_usdc) / 1_000_000;
    console.log("  SQLite:", {
      clerkId: inDb.user_id,
      circleWalletId: inDb.circle_wallet_id,
      ledgerUsdc: ledger,
    });
    console.log("  Circle (by wallet id):", await circleBalanceByWalletId(inDb.circle_wallet_id));
  } else {
    console.log("  SQLite: not in local users table");
  }

  const onChain = await erc20Balance(addr, BASE_USDC);
  console.log("  Base USDC (on-chain ERC-20):", onChain);

  const found = await findCircleWalletIdByAddress(addr);
  if (found) {
    console.log("  Circle listWallets:", found);
    console.log("  Circle balance:", await circleBalanceByWalletId(found.id));
  } else {
    console.log("  Circle listWallets: not found in CIRCLE_WALLET_SET_ID (or different API key)");
  }
  console.log("  BaseScan:", `https://basescan.org/address/${addr}`);
}
