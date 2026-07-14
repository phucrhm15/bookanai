/**
 * Bridge small USDC Base → Arc Testnet, then run arc-batch-memo-test.
 * npx tsx scripts/arc-fund-and-batch.ts [count] [usdcEach]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { createPublicClient, formatUnits, http } from "viem";
import { base } from "viem/chains";
import { arcTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_USDC_CONTRACT_ADDRESS } from "../src/lib/chains";

const require = createRequire(import.meta.url);
const { AppKit } = require("@circle-fin/app-kit") as { AppKit: new () => { bridge: (p: unknown) => Promise<{ state?: string }> } };
const { createViemAdapterFromPrivateKey } = require("@circle-fin/adapter-viem-v2") as {
  createViemAdapterFromPrivateKey: (opts: { privateKey: `0x${string}` }) => unknown;
};

function loadEnv(): void {
  const path = resolve(".env.local");
  if (!existsSync(path)) process.exit(1);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const pk = process.env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(pk);
const bridgeUsdc = Number(process.env.ARC_BRIDGE_USDC ?? "0.05");

const baseClient = createPublicClient({ chain: base, transport: http() });
const arcClient = createPublicClient({
  chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.network"),
});

let arcBal = Number(formatUnits(await arcClient.getBalance({ address: account.address }), 18));
console.log(`Sender ${account.address}`);
console.log(`Arc USDC before: ${arcBal.toFixed(6)}`);

const needed = Number(process.argv[3] ?? 0.001) * Number(process.argv[2] ?? 3) + 0.02;

if (arcBal < needed) {
  console.log(`Bridging ${bridgeUsdc} USDC Base → Arc_Testnet…`);
  const kit = new AppKit();
  const adapter = createViemAdapterFromPrivateKey({ privateKey: pk });
  try {
    const result = await kit.bridge({
      from: { adapter, chain: "Base" },
      to: { adapter, chain: "Arc_Testnet", recipientAddress: account.address },
      amount: String(bridgeUsdc),
    });
    console.log("Bridge result:", JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("Bridge failed:", e);
    console.error(
      `\nManual fund: https://faucet.circle.com → Arc Testnet → ${account.address}`,
    );
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 15_000));
  arcBal = Number(formatUnits(await arcClient.getBalance({ address: account.address }), 18));
  console.log(`Arc USDC after bridge: ${arcBal.toFixed(6)}`);
}

if (arcBal < needed) {
  console.error(`Still insufficient Arc USDC (need ~${needed}). Fund via faucet.`);
  process.exit(1);
}

const { spawnSync } = await import("node:child_process");
const args = process.argv.slice(2);
const run = spawnSync("npx", ["tsx", "scripts/arc-batch-memo-test.ts", ...args], {
  stdio: "inherit",
  shell: true,
  cwd: process.cwd(),
});
process.exit(run.status ?? 1);
