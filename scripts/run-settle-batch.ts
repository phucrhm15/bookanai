import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { processSettlementBatch } from "../src/server/services/onchain-settlement";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const result = await processSettlementBatch();
console.log(JSON.stringify(result, null, 2));
