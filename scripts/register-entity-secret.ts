/**
 * Step 1: Register ENTITY_SECRET with Circle (one-time per entity secret).
 * Requires CIRCLE_API_KEY + ENTITY_SECRET in .env.local
 * Run: npm run setup:register-secret
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) {
    console.error("Missing .env.local — set CIRCLE_API_KEY and ENTITY_SECRET first.");
    process.exit(1);
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const apiKey = process.env.CIRCLE_API_KEY?.trim();
const entitySecret = process.env.ENTITY_SECRET?.trim();

if (!apiKey || !entitySecret || entitySecret.includes("your-32-byte")) {
  console.error("Set CIRCLE_API_KEY and ENTITY_SECRET in .env.local before running.");
  process.exit(1);
}

const recoveryDir = resolve(process.cwd(), "data", "circle-recovery");
mkdirSync(recoveryDir, { recursive: true });

try {
  const response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: recoveryDir,
  });

  const recoveryPayload = response.data?.recoveryFile;
  const recoveryFile = resolve(recoveryDir, "recovery.dat");
  if (recoveryPayload) {
    writeFileSync(recoveryFile, recoveryPayload, "utf8");
  }

  console.log("Entity secret registered successfully with Circle.");
  console.log(`Recovery directory: ${recoveryDir}`);
  console.log("Keep ENTITY_SECRET and the recovery file offline — never commit them.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/already|registered|exists/i.test(message)) {
    console.log("Entity secret appears already registered for this API key.");
    console.log("If you rotated the secret, register the new one in Circle Console.");
    process.exit(0);
  }
  console.error("Registration failed:", message);
  process.exit(1);
}
