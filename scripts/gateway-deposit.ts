/**
 * Deposit USDC from x402 EOA into Circle Gateway (required before client.pay works).
 * Usage: npm run gateway:deposit -- 0.05
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { readOnChainGatewayAvailableUsdc } from "../src/lib/gateway-onchain-balance";
import { gatewayChainKeyForChainId, BASE_CHAIN_ID } from "../src/lib/chains";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const amount = process.argv[2] ?? "0.05";
const pk = process.env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`;
const chain = gatewayChainKeyForChainId(BASE_CHAIN_ID);
const { GatewayClient } = await import("@circle-fin/x402-batching/client");
const client = new GatewayClient({ chain, privateKey: pk });

const before = await client.getBalances();
console.log("Before — wallet:", before.wallet.formatted, "| gateway available:", before.gateway.formattedAvailable);

const result = await client.deposit(amount);
console.log("Deposit tx:", result.depositTxHash);
if (result.approvalTxHash) console.log("Approve tx:", result.approvalTxHash);

const after = await client.getBalances();
const onChain = await readOnChainGatewayAvailableUsdc(
  privateKeyToAccount(pk).address,
  process.env.BASE_RPC_URL,
);
console.log("After — wallet:", after.wallet.formatted, "| gateway API:", after.gateway.formattedAvailable, "| on-chain:", onChain.toFixed(6));
