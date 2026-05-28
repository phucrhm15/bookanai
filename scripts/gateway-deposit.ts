/**
 * Deposit USDC from x402 EOA into Circle Gateway (required before client.pay works).
 * Usage:
 *   npm run gateway:deposit -- 0.05 base
 *   npm run gateway:deposit -- 0.05 polygon
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, polygon } from "viem/chains";
import { readOnChainGatewayAvailableUsdc, MAINNET_GATEWAY_WALLET_ADDRESS } from "../src/lib/gateway-onchain-balance";
import { BASE_USDC_CONTRACT_ADDRESS, POLYGON_USDC_CONTRACT_ADDRESS } from "../src/lib/chains";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const amount = process.argv[2] ?? "0.05";
const chainArg = (process.argv[3] ?? "base").toLowerCase();
const chain = chainArg === "polygon" ? "polygon" : "base";
const pk = process.env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`;
const { GatewayClient } = await import("@circle-fin/x402-batching/client");
const client = new GatewayClient({ chain, privateKey: pk });

const before = await client.getBalances();
console.log("Before — wallet:", before.wallet.formatted, "| gateway available:", before.gateway.formattedAvailable);

if (chain === "polygon") {
  const account = privateKeyToAccount(pk);
  const rpcUrl = process.env.POLYGON_RPC_URL ?? "https://1rpc.io/matic";
  const publicClient = createPublicClient({ chain: polygon, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: polygon, transport: http(rpcUrl) });
  const depositAmount = parseUnits(amount, 6);

  const erc20Abi = [
    {
      type: "function",
      name: "allowance",
      stateMutability: "view",
      inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
    },
    {
      type: "function",
      name: "approve",
      stateMutability: "nonpayable",
      inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }],
      outputs: [{ name: "", type: "bool" }],
    },
  ] as const;
  const gatewayAbi = [
    {
      type: "function",
      name: "deposit",
      stateMutability: "nonpayable",
      inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }],
      outputs: [],
    },
  ] as const;

  const allowance = await publicClient.readContract({
    address: POLYGON_USDC_CONTRACT_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, MAINNET_GATEWAY_WALLET_ADDRESS],
  });

  let approvalTxHash: `0x${string}` | undefined;
  if (allowance < depositAmount) {
    approvalTxHash = await walletClient.writeContract({
      address: POLYGON_USDC_CONTRACT_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [MAINNET_GATEWAY_WALLET_ADDRESS, depositAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
  }

  const depositTxHash = await walletClient.writeContract({
    address: MAINNET_GATEWAY_WALLET_ADDRESS,
    abi: gatewayAbi,
    functionName: "deposit",
    args: [POLYGON_USDC_CONTRACT_ADDRESS, depositAmount],
    // x402 SDK hardcodes 120k and often reverts on Polygon; use safer ceiling.
    gas: 350000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: depositTxHash });
  console.log("Deposit tx:", depositTxHash);
  if (approvalTxHash) console.log("Approve tx:", approvalTxHash);
  console.log("Deposit receipt status:", receipt.status);
} else {
  const result = await client.deposit(amount);
  console.log("Deposit tx:", result.depositTxHash);
  if (result.approvalTxHash) console.log("Approve tx:", result.approvalTxHash);
}

const after = await client.getBalances();
const onChain = await readOnChainGatewayAvailableUsdc(
  privateKeyToAccount(pk).address,
  chain === "polygon" ? process.env.POLYGON_RPC_URL : process.env.BASE_RPC_URL,
  chain,
);
console.log("After — wallet:", after.wallet.formatted, "| gateway API:", after.gateway.formattedAvailable, "| on-chain:", onChain.toFixed(6));
