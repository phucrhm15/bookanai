import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, formatEther, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { BASE_USDC_CONTRACT_ADDRESS } from "../src/lib/chains";
import { isLiveCircleApiKey } from "../src/lib/circle-dcw-blockchains";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.ENTITY_SECRET!,
});

const masterId = process.env.MASTER_CIRCLE_WALLET_ID;

console.log("Key:", isLiveCircleApiKey(process.env.CIRCLE_API_KEY!) ? "LIVE → Base USDC" : "TEST");

if (masterId) {
  const m = await client.getWalletTokenBalance({
    id: masterId,
    tokenAddresses: [BASE_USDC_CONTRACT_ADDRESS],
  });
  console.log("\nMaster DCW", process.env.MASTER_CIRCLE_WALLET_ID?.slice(0, 8) + "…");
  for (const t of m.data?.tokenBalances ?? []) {
    console.log(`  ${t.token?.blockchain} USDC: ${t.amount ?? "0"}`);
  }
}

const x402 = privateKeyToAccount(process.env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`).address;
console.log("\nx402 Gateway EOA (USDC + ETH gas for agent API pay — NOT user wallet):", x402);
console.log("  https://basescan.org/address/" + x402);

const rpc = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
const baseClient = createPublicClient({ chain: base, transport: http(rpc) });
const ethWei = await baseClient.getBalance({ address: x402 });
const eth = Number.parseFloat(formatEther(ethWei));
console.log(`  ETH (gas): ${eth.toFixed(6)}`);
if (eth < 0.0001) {
  console.log("  ⚠ Low ETH — nạp ~0.001 ETH Base vào địa chỉ trên (admin), không phải ví user.");
}

const usdcAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
const usdcRaw = await baseClient.readContract({
  address: BASE_USDC_CONTRACT_ADDRESS,
  abi: usdcAbi,
  functionName: "balanceOf",
  args: [x402],
});
const usdcOnChain = Number.parseFloat((Number(usdcRaw) / 1e6).toFixed(6));
console.log(`  USDC on-chain (x402 pay): ${usdcOnChain}`);
if (usdcOnChain < 0.22) {
  console.log("  ⚠ Thiếu USDC — Stack B cần ~0.22 USDC/lần. Nạp USDC Base vào địa chỉ trên.");
}

if (existsSync(resolve("data/bookanai.db"))) {
  console.log("\nSQLite: data/bookanai.db exists");
}
