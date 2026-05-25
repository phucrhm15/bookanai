/**
 * Send USDC from a Circle Developer-Controlled wallet (Console has no "Send" on wallet list).
 *
 * Usage:
 *   node scripts/recover-usdc-transfer.mjs --from-wallet-id <uuid> --to 0xDest [--amount 0.05]
 *   node scripts/recover-usdc-transfer.mjs --from-address 0xSource --to 0xDest [--amount all]
 *
 * Safety: omit --yes to preview only; add --yes to execute on mainnet.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TERMINAL = new Set(["COMPLETE", "FAILED", "DENIED", "CANCELLED"]);

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

function parseArgs(argv) {
  const out = { yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes") out.yes = true;
    else if (a === "--from-wallet-id") out.fromWalletId = argv[++i];
    else if (a === "--from-address") out.fromAddress = argv[++i]?.toLowerCase();
    else if (a === "--to") out.to = argv[++i];
    else if (a === "--amount") out.amount = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.to?.startsWith("0x") || args.to.length !== 42) {
  console.error("Required: --to 0x... (42-char destination)");
  process.exit(1);
}
if (!args.fromWalletId && !args.fromAddress) {
  console.error("Required: --from-wallet-id <uuid> OR --from-address 0x...");
  process.exit(1);
}

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.ENTITY_SECRET,
});

async function resolveSource() {
  if (args.fromWalletId) {
    const w = await client.getWallet({ id: args.fromWalletId });
    const address = w.data?.wallet?.address;
    if (!address) throw new Error(`Wallet not found: ${args.fromWalletId}`);
    return { walletId: args.fromWalletId, address };
  }

  const target = args.fromAddress;
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  if (!walletSetId) throw new Error("CIRCLE_WALLET_SET_ID missing in .env.local");

  let pageAfter;
  for (let page = 0; page < 50; page++) {
    const res = await client.listWallets({
      walletSetId,
      pageSize: 50,
      ...(pageAfter ? { pageAfter } : {}),
    });
    for (const w of res.data?.wallets ?? []) {
      if (w.address?.toLowerCase() === target && w.id) {
        return { walletId: w.id, address: w.address };
      }
    }
    pageAfter = res.data?.pagination?.nextPageAfter;
    if (!pageAfter) break;
  }
  throw new Error(`Address not in wallet set: ${target}`);
}

async function getUsdcBalance(walletId) {
  const res = await client.getWalletTokenBalance({
    id: walletId,
    tokenAddresses: [BASE_USDC],
  });
  const row = res.data?.tokenBalances?.[0];
  return Number(row?.amount ?? 0);
}

function formatAmount(n) {
  return n.toFixed(6).replace(/\.?0+$/, "") || "0";
}

async function pollTransaction(transactionId) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const res = await client.getTransaction({ id: transactionId });
    const tx = res.data?.transaction;
    const state = tx?.state;
    if (state && TERMINAL.has(state)) {
      return tx;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for transaction");
}

const source = await resolveSource();
const balance = await getUsdcBalance(source.walletId);
const sendAmount =
  !args.amount || args.amount === "all"
    ? balance
    : Number(args.amount);

if (!Number.isFinite(sendAmount) || sendAmount <= 0) {
  console.error("Nothing to send (balance:", balance, ")");
  process.exit(1);
}
if (sendAmount > balance + 0.000001) {
  console.error(`Amount ${sendAmount} exceeds balance ${balance}`);
  process.exit(1);
}

console.log("--- Recover USDC (Base mainnet) ---");
console.log("From wallet id:", source.walletId);
console.log("From address: ", source.address);
console.log("To:           ", args.to);
console.log("Balance:      ", balance, "USDC");
console.log("Send:         ", sendAmount, "USDC");
console.log("BaseScan from:", `https://basescan.org/address/${source.address}`);
console.log("BaseScan to:  ", `https://basescan.org/address/${args.to}`);

if (!args.yes) {
  console.log("\nPreview only. Re-run with --yes to send on mainnet.");
  process.exit(0);
}

console.log("\nSending…");
let createResponse;
try {
  createResponse = await client.createTransaction({
    walletAddress: source.address,
    blockchain: "BASE",
    tokenAddress: BASE_USDC,
    destinationAddress: args.to,
    amount: [formatAmount(sendAmount)],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
    refId: `bookanai-recover-${Date.now()}`,
  });
} catch (e) {
  console.error("createTransaction failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}

const transactionId = createResponse.data?.id;
if (!transactionId) {
  console.error("No transaction id returned");
  process.exit(1);
}

console.log("Transaction id:", transactionId);
const tx = await pollTransaction(transactionId);
console.log("State:", tx?.state);
if (tx?.txHash) {
  console.log("Tx hash:", tx.txHash);
  console.log("Explorer:", `https://basescan.org/tx/${tx.txHash}`);
}
if (tx?.state !== "COMPLETE") {
  process.exit(1);
}
console.log("Done.");
