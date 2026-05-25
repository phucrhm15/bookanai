import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASE_CHAIN_ID } from "../src/lib/chains";
import { payX402Resource } from "../src/server/services/x402-master-pay";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const url =
  process.argv[2] ?? "https://api.messari.io/metrics/v2/assets/ath?slugs=bitcoin,ethereum&limit=2";

try {
  const res = await payX402Resource(url, BASE_CHAIN_ID, 0.1);
  console.log("OK", res.status, JSON.stringify(res.data).slice(0, 500));
} catch (e) {
  console.error("FAIL", e);
  process.exit(1);
}
