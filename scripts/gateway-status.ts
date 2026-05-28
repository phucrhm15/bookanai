import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { readOnChainGatewayAvailableUsdc } from "../src/lib/gateway-onchain-balance";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const pk = process.env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`;
const chainArg = (process.argv[2] ?? "base").toLowerCase();
const chain = chainArg === "polygon" ? "polygon" : "base";
const { GatewayClient } = await import("@circle-fin/x402-batching/client");
const client = new GatewayClient({ chain, privateKey: pk });

const address = privateKeyToAccount(pk).address;
const balances = await client.getBalances();
const onChainAvailable = await readOnChainGatewayAvailableUsdc(
  address,
  chain === "polygon" ? process.env.POLYGON_RPC_URL : process.env.BASE_RPC_URL,
  chain,
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
  console.log(`  npm run gateway:deposit -- 0.05 ${chain}`);
  console.log(
    chain === "polygon"
      ? "(Requires USDC + MATIC gas on Polygon for the x402 EOA above)"
      : "(Requires USDC + ETH gas on Base for the x402 EOA above)",
  );
}
