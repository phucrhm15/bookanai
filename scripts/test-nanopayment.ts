import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { handleNanopaymentX402, CircleServiceError } from "../src/services/circleService";
import { BASE_CHAIN_ID } from "../src/lib/chains";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const walletId = process.argv[2] ?? "9c9739e2-6c60-5efc-bf0e-8d43124093b9";

try {
  const result = await handleNanopaymentX402(walletId, "alpha-caller-x", BASE_CHAIN_ID);
  console.log("OK", JSON.stringify(result, null, 2).slice(0, 800));
} catch (e) {
  if (e instanceof CircleServiceError) {
    console.error("CircleServiceError", e.code, e.message);
  } else {
    const err = e as { response?: { status?: number; data?: unknown }; message?: string };
    console.error("Error", err.message);
    if (err.response?.data) console.error("response", JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
}
