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

const pk = process.env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`;
const chain = gatewayChainKeyForChainId(BASE_CHAIN_ID);
const { GatewayClient } = await import("@circle-fin/x402-batching/client");
const client = new GatewayClient({ chain, privateKey: pk });

const address = privateKeyToAccount(pk).address;
const balances = await client.getBalances();
const onChainAvailable = await readOnChainGatewayAvailableUsdc(
  address,
  process.env.BASE_RPC_URL,
);
const effectiveAvailable = Math.max(
  Number.parseFloat(balances.gateway.formattedAvailable) || 0,
  onChainAvailable,
);

console.log("x402 signer (MASTER_AGENT_PRIVATE_KEY):", address);
console.log("chain:", chain);
console.log("EOA wallet USDC:", balances.wallet.formatted);
console.log("Gateway available (API):", balances.gateway.formattedAvailable);
console.log("Gateway available (on-chain):", onChainAvailable.toFixed(6));
console.log("Gateway total (API):", balances.gateway.formattedTotal);
console.log("Effective for pay:", effectiveAvailable.toFixed(6));

if (effectiveAvailable < 0.01) {
  console.log("\nGateway balance is empty — nanopayments will fail until you deposit:");
  console.log("  npm run gateway:deposit -- 0.05");
  console.log("(Requires USDC + ETH for gas on the x402 EOA above)");
}
