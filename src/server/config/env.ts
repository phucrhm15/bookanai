import { z } from "zod";

const envSchema = z.object({
  CIRCLE_API_KEY: z.string().min(1),
  ENTITY_SECRET: z.string().min(1),
  MASTER_AGENT_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "MASTER_AGENT_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key"),
  CIRCLE_WALLET_SET_ID: z.string().min(1),
  BASE_RPC_URL: z.string().url().default("https://mainnet.base.org"),
  /** Polygon mainnet — Surf x402 Gateway (do not use polygon-rpc.com without a paid key) */
  POLYGON_RPC_URL: z.string().url().default("https://polygon.llamarpc.com"),
  ARC_RPC_URL: z.string().url().default("https://rpc.testnet.arc.network"),
  BASE_CHAIN_ID: z.coerce.number().default(8453),
  ARC_CHAIN_ID: z.coerce.number().default(5042002),
  USDC_CONTRACT_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .default("0x3600000000000000000000000000000000000000"),
  X402_DISCOVERY_URL: z
    .string()
    .url()
    .default("https://api.circle.com/v2/x402/discovery/resources"),
  SETTLEMENT_CRON_SECRET: z.string().min(16).optional(),
  /** Optional — enables App Kit swap (format KIT_KEY:id:secret). Bridge/deposit/unified balance do not require it. */
  CIRCLE_KIT_KEY: z
    .string()
    .regex(/^KIT_KEY:/, "CIRCLE_KIT_KEY must start with KIT_KEY:")
    .optional(),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}

export function isCircleConfigured(): boolean {
  return envSchema.safeParse(process.env).success;
}
