/**
 * Arc Testnet v0.7.2 — batch USDC + memo via Multicall3From.
 * Run: npx tsx scripts/arc-batch-memo-test.ts [count] [usdcEach]
 * Example: npx tsx scripts/arc-batch-memo-test.ts 3 0.001
 *
 * Uses Circle DCW when CIRCLE_API_KEY is TEST_API_KEY; otherwise signs via
 * MASTER_AGENT_PRIVATE_KEY (or ARC_SENDER_PRIVATE_KEY) on Arc RPC.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import type { TransactionState } from "@circle-fin/developer-controlled-wallets";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  encodePacked,
  formatUnits,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseGwei,
  toHex,
} from "viem";
import { arcTestnet } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  ARC_MEMO_CONTRACT_ADDRESS,
  ARC_MULTICALL3_FROM_ADDRESS,
  formatNativeUsdcForDcw,
  usdcToErc20Atomic,
  usdcToNativeWei,
} from "../src/lib/arc-transaction-extensions";
import { ARC_USDC_CONTRACT_ADDRESS } from "../src/lib/chains";
import { arcExplorerTxUrl } from "../src/lib/arc-testnet-ecosystem";

const MEMO_TEXT = "hello i'm testing";
const POLL_MS = 2_000;
const POLL_TIMEOUT_MS = 180_000;
/** Max sendWithMemo subcalls per Multicall3From tx (gas safety). */
const MAX_CALLS_PER_TX = 25;

const TX_TERMINAL = new Set<TransactionState>([
  "COMPLETE",
  "CONFIRMED",
  "FAILED",
  "DENIED",
  "CANCELLED",
]);
const TX_SUCCESS = new Set<TransactionState>(["COMPLETE", "CONFIRMED"]);

function loadEnvLocal(): void {
  const path = resolve(".env.local");
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
}

function randomRecipient(): `0x${string}` {
  return privateKeyToAccount(generatePrivateKey()).address;
}

/** Deterministic-ish random address (no extra key material stored). */
function pseudoRandomRecipient(seed: string): `0x${string}` {
  const hash = keccak256(encodePacked(["string", "uint256"], [seed, BigInt(Date.now())]));
  return `0x${hash.slice(26)}` as `0x${string}`;
}

const memoAbi = parseAbi([
  "function sendWithMemo(address to, uint256 amount, bytes memo)",
]);

const multicallAbi = parseAbi([
  "function aggregate3Value((address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
]);

async function pollTx(
  client: ReturnType<typeof initiateDeveloperControlledWalletsClient>,
  id: string,
): Promise<TransactionState> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await client.getTransaction({ id });
    const state = res.data?.transaction?.state;
    if (state && TX_TERMINAL.has(state)) {
      if (state && TX_SUCCESS.has(state)) return state;
      throw new Error(`Transaction ended: ${state}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error("Poll timeout");
}

loadEnvLocal();

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.ENTITY_SECRET;
const walletId = process.env.MASTER_CIRCLE_WALLET_ID;
const useDcw = apiKey?.startsWith("TEST_API_KEY");

const count = Math.min(Math.max(Number(process.argv[2] ?? 3), 1), 100);
const usdcEach = Math.min(Math.max(Number(process.argv[3] ?? 0.001), 0.000_001), 1);

const recipients = Array.from({ length: count }, (_, i) =>
  getAddress(pseudoRandomRecipient(`bookanai-batch-${i}-${Date.now()}`)),
);

function buildCalls(addrs: readonly `0x${string}`) {
  return addrs.map((to) => {
    const callData = encodeFunctionData({
      abi: memoAbi,
      functionName: "sendWithMemo",
      args: [to, usdcToErc20Atomic(usdcEach), memoBytes],
    });
    return {
      target: ARC_MEMO_CONTRACT_ADDRESS,
      allowFailure: false,
      value: usdcToNativeWei(usdcEach),
      callData,
    };
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

const memoBytes = toHex(MEMO_TEXT);
const batchId = `arc-demo-${Date.now()}`;
const recipientChunks = chunk(recipients, MAX_CALLS_PER_TX);

const totalNeeded = usdcEach * count;

console.log(`Batch: ${count} × ${usdcEach} USDC = ${totalNeeded} USDC + gas`);
console.log(`Memo: "${MEMO_TEXT}"`);
console.log(`On-chain txs: ${recipientChunks.length} (max ${MAX_CALLS_PER_TX} calls each)\n`);
console.log("Recipients:");
for (const addr of recipients) {
  console.log(`  ${addr}`);
}

if (useDcw) {
  if (!entitySecret || !walletId) {
    console.error("ENTITY_SECRET and MASTER_CIRCLE_WALLET_ID required in .env.local");
    process.exit(1);
  }

  const client = initiateDeveloperControlledWalletsClient({ apiKey: apiKey!, entitySecret });

  const balanceRes = await client.getWalletTokenBalance({
    id: walletId,
    tokenAddresses: [ARC_USDC_CONTRACT_ADDRESS],
  });
  const arcBalance = Number(balanceRes.data?.tokenBalances?.[0]?.amount ?? 0);

  console.log(`\nMaster DCW wallet ${walletId}`);
  console.log(`Arc USDC balance: ${arcBalance}`);

  if (arcBalance < totalNeeded + 0.01) {
    console.error(
      `Insufficient Arc USDC. Fund from https://faucet.circle.com (Arc Testnet).`,
    );
    process.exit(1);
  }

  for (let i = 0; i < recipientChunks.length; i++) {
    const chunkAddrs = recipientChunks[i]!;
    const calls = buildCalls(chunkAddrs);
    const totalNativeWei = calls.reduce((s, c) => s + c.value, 0n);
    const batchCallData = encodeFunctionData({
      abi: multicallAbi,
      functionName: "aggregate3Value",
      args: [calls],
    });

    const createRes = await client.createContractExecutionTransaction({
      walletId,
      contractAddress: ARC_MULTICALL3_FROM_ADDRESS,
      callData: batchCallData,
      amount: formatNativeUsdcForDcw(Number(totalNativeWei) / 1e18),
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: randomUUID(),
      refId: `${batchId}-${i + 1}`,
    });

    const txId = createRes.data?.id;
    if (!txId) {
      console.error("No Circle transaction id returned", createRes);
      process.exit(1);
    }

    console.log(`\n[${i + 1}/${recipientChunks.length}] Circle tx ${txId} — polling…`);
    const state = await pollTx(client, txId);
    const detail = await client.getTransaction({ id: txId });
    const onChainHash = detail.data?.transaction?.txHash;
    console.log(`✅ Chunk ${i + 1} complete (${state}) — ${chunkAddrs.length} recipients`);
    if (onChainHash) console.log(`Arc explorer: ${arcExplorerTxUrl(onChainHash)}`);
  }
} else {
  const pk = (process.env.ARC_SENDER_PRIVATE_KEY ?? process.env.MASTER_AGENT_PRIVATE_KEY) as
    | `0x${string}`
    | undefined;
  if (!pk?.startsWith("0x")) {
    console.error(
      "LIVE_API_KEY: set ARC_SENDER_PRIVATE_KEY or MASTER_AGENT_PRIVATE_KEY funded on Arc Testnet.",
    );
    process.exit(1);
  }

  const account = privateKeyToAccount(pk);
  const rpc = process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network";
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpc) });
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(rpc),
  });

  const bal = await publicClient.getBalance({ address: account.address });
  const balUsdc = Number(formatUnits(bal, 18));
  console.log(`\nSender EOA ${account.address}`);
  console.log(`Arc native USDC: ${balUsdc.toFixed(6)}`);

  if (balUsdc < totalNeeded + 0.05) {
    console.error(
      `Insufficient Arc USDC on sender. Need ~${totalNeeded} USDC — fund ${account.address} via https://faucet.circle.com`,
    );
    process.exit(1);
  }

  const txHashes: string[] = [];

  for (let i = 0; i < recipientChunks.length; i++) {
    const chunkAddrs = recipientChunks[i]!;
    const calls = buildCalls(chunkAddrs);
    const totalNativeWei = calls.reduce((s, c) => s + c.value, 0n);

    const hash = await walletClient.writeContract({
      address: ARC_MULTICALL3_FROM_ADDRESS,
      abi: multicallAbi,
      functionName: "aggregate3Value",
      args: [calls],
      value: totalNativeWei,
      maxFeePerGas: parseGwei("25"),
      maxPriorityFeePerGas: parseGwei("1"),
    });

    console.log(`\n[${i + 1}/${recipientChunks.length}] Submitted ${hash} — waiting…`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    txHashes.push(hash);
    console.log(
      `✅ Chunk ${i + 1} complete (block ${receipt.blockNumber}) — ${chunkAddrs.length} recipients`,
    );
    console.log(`Arc explorer: ${arcExplorerTxUrl(hash)}`);
  }

  console.log(`\n✅ All ${count} recipients paid in ${txHashes.length} transaction(s)`);
}

console.log(`Multicall3From: ${ARC_MULTICALL3_FROM_ADDRESS}`);
console.log(`Memo contract: ${ARC_MEMO_CONTRACT_ADDRESS}`);
