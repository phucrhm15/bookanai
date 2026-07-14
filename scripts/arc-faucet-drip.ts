import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";

const path = resolve(".env.local");
if (!existsSync(path)) process.exit(1);
for (const line of readFileSync(path, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const address =
  process.argv[2] ??
  privateKeyToAccount(process.env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`).address;

const res = await fetch("https://api.circle.com/v1/faucet/drips", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
    "Content-Type": "application/json",
    "X-Request-Id": randomUUID(),
  },
  body: JSON.stringify({
    address,
    blockchain: "ARC-TESTNET",
    usdc: true,
  }),
  signal: AbortSignal.timeout(30_000),
});

console.log("address", address);
console.log("status", res.status, await res.text());
