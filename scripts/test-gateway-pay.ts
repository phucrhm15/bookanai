import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { resolveAgentServiceUrl } from "../src/services/agent-service-map";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const pk = process.env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(pk);
console.log("x402 signer:", account.address);

const url = await resolveAgentServiceUrl("rwa-thread-writer");
console.log("resource:", url);

const { GatewayClient } = await import("@circle-fin/x402-batching/client");
const client = new GatewayClient({ chain: "base", privateKey: pk });

try {
  const res = await client.pay(url);
  console.log("pay OK", res.status, JSON.stringify(res.data).slice(0, 300));
} catch (e: unknown) {
  const err = e as { message?: string; cause?: unknown; response?: { data?: unknown } };
  console.error("pay FAIL message:", err.message);
  if (err.cause) console.error("cause:", err.cause);
  console.error("full:", e);
}
