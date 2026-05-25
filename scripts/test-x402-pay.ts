import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_CHAIN_ID } from "../src/lib/chains";
import { readOnChainGatewayAvailableUsdc } from "../src/lib/gateway-onchain-balance";
import { withAgentResourceQuery, payOptionsForAgent } from "../src/server/services/nanopayment-x402";
import { payX402Resource } from "../src/server/services/x402-master-pay";
import { resolveAgentServiceUrl } from "../src/services/agent-service-map";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const pk = process.env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`;
const addr = privateKeyToAccount(pk).address;
const onChain = await readOnChainGatewayAvailableUsdc(addr, process.env.BASE_RPC_URL);
console.log("on-chain gateway:", onChain, "depositor", addr);

const agent = process.argv[2] ?? "perplexity-social";
const mapped = await resolveAgentServiceUrl(agent);
const url = withAgentResourceQuery(agent, mapped, "BTC price today?");
const opts = payOptionsForAgent(agent, "BTC price today?");
console.log("paying", agent, url, opts);

try {
  const res = await payX402Resource(url, BASE_CHAIN_ID, agent === "messari-analyst" ? 0.1 : 0.012, opts);
  console.log("OK status", res.status, JSON.stringify(res.data).slice(0, 400));
} catch (e) {
  console.error("FAIL", e);
  process.exit(1);
}
