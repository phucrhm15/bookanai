/**
 * Master-agent x402 payment router.
 * - Circle Gateway batching (AIsa / Discovery sellers)
 * - Standard EIP-3009 exact (Messari and other non-Gateway sellers)
 */
import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import {
  BASE_USDC_CONTRACT_ADDRESS,
  gatewayChainKeyForChainId,
  type SupportedChainId,
} from "@/lib/chains";
import { getGatewayLiquiditySnapshot } from "@/lib/gateway-onchain-balance";
import { sanitizeRpcUrls } from "@/lib/rpc-urls";
import { getServerEnv } from "@/server/config/env";
import { CircleServiceError } from "@/services/circle-errors";
import {
  getDiscoveryCatalogItem,
  type DiscoveryAccept,
} from "@/services/agent-service-map";

const erc20BalanceAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

export type X402PayRequestInit = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
};

export type X402PayResult = {
  status: number;
  data: unknown;
};

function masterDepositorAddress(): `0x${string}` {
  const env = getServerEnv();
  return privateKeyToAccount(env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`).address;
}

function rpcUrlCandidates(): string[] {
  const env = getServerEnv();
  return sanitizeRpcUrls([
    env.BASE_RPC_URL,
    "https://mainnet.base.org",
    "https://base.llamarpc.com",
  ]);
}

function polygonRpcCandidates(): string[] {
  const env = getServerEnv();
  return sanitizeRpcUrls([
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon.llamarpc.com",
    "https://1rpc.io/matic",
    "https://rpc.ankr.com/polygon",
    env.POLYGON_RPC_URL,
  ]);
}

function rpcUrlForChain(chainId: number): string | undefined {
  if (chainId === 8453) return rpcUrlCandidates()[0];
  if (chainId === 137) return polygonRpcCandidates()[0];
  return undefined;
}

function requirePolygonRpc(): string {
  const url = polygonRpcCandidates()[0];
  if (!url) {
    throw new CircleServiceError(
      "POLYGON_RPC_URL is missing or blocked (polygon-rpc.com requires a paid key). Set POLYGON_RPC_URL=https://polygon.llamarpc.com",
      "NETWORK_ERROR",
    );
  }
  return url;
}

type GatewayChainKey = "base" | "polygon" | "arcTestnet";

function rpcCandidatesForGatewayChain(chain: GatewayChainKey): string[] {
  if (chain === "polygon") return polygonRpcCandidates();
  if (chain === "base") return rpcUrlCandidates();
  return [getServerEnv().ARC_RPC_URL];
}

function rpcUrlForGatewayChain(chain: GatewayChainKey): string {
  if (chain === "polygon") return requirePolygonRpc();
  if (chain === "base") return rpcUrlCandidates()[0] ?? getServerEnv().BASE_RPC_URL;
  return getServerEnv().ARC_RPC_URL;
}

function expectedNetworkForGatewayChain(chain: GatewayChainKey): string {
  if (chain === "polygon") return "eip155:137";
  if (chain === "base") return "eip155:8453";
  return "eip155:5042002";
}

function pickGatewayBatchingOption(
  accepts: PaymentRequiredAccept[],
  gatewayChain: GatewayChainKey,
): PaymentRequiredAccept | undefined {
  const expectedNetwork = expectedNetworkForGatewayChain(gatewayChain);
  return accepts.find((opt) => {
    const extra = opt.extra as Record<string, unknown> | undefined;
    return (
      opt.network === expectedNetwork &&
      extra?.name === "GatewayWalletBatched" &&
      extra?.version === "1"
    );
  });
}

function gatewayChainFromDiscoveryAccepts(
  accepts: DiscoveryAccept[],
  resourceUrl: string,
): GatewayChainKey | null {
  const asPayment = accepts as PaymentRequiredAccept[];
  const host = new URL(resourceUrl).hostname.toLowerCase();
  const order: GatewayChainKey[] =
    host === "nano.blockrun.ai" ? ["polygon", "base"] : ["base", "polygon"];
  for (const chain of order) {
    if (pickGatewayBatchingOption(asPayment, chain)) return chain;
  }
  return null;
}

async function readMasterBaseWalletUsdc(): Promise<number> {
  const depositor = masterDepositorAddress();
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrlCandidates()[0] ?? getServerEnv().BASE_RPC_URL),
  });
  const raw = await client.readContract({
    address: BASE_USDC_CONTRACT_ADDRESS,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    args: [depositor],
  });
  return Number.parseFloat(formatUnits(raw, 6));
}

async function ensureMasterWalletUsdcOnBase(minUsdc: number): Promise<void> {
  const walletUsdc = await readMasterBaseWalletUsdc();
  if (walletUsdc + 1e-9 < minUsdc) {
    const depositor = masterDepositorAddress();
    throw new CircleServiceError(
      `Ví master thiếu USDC on-chain trên Base (${walletUsdc.toFixed(6)} < ${minUsdc} USDC) cho x402 exact (Web Search / Messari). ` +
        `Nạp USDC trực tiếp vào ${depositor} trên Base — khác với npm run gateway:deposit.`,
      "INSUFFICIENT_BALANCE",
    );
  }
}

/** x402 EOA that pays Circle Agent APIs (on-chain Base USDC, not Gateway deposit). */
export function getMasterX402DepositorAddress(): `0x${string}` {
  return masterDepositorAddress();
}

export async function getMasterBaseWalletUsdc(): Promise<number> {
  return readMasterBaseWalletUsdc();
}

export async function assertMasterBaseUsdcBalance(minUsdc: number): Promise<void> {
  return ensureMasterWalletUsdcOnBase(minUsdc);
}

async function resolveGatewayChainForResource(
  resourceUrl: string,
  privateKey: `0x${string}`,
): Promise<GatewayChainKey | null> {
  // Surf / nano.blockrun require GatewayWalletBatched on Polygon — try polygon before base.
  const order: GatewayChainKey[] = ["polygon", "base", "arcTestnet"];
  for (const chain of order) {
    for (const rpcUrl of rpcCandidatesForGatewayChain(chain)) {
      const gateway = new GatewayClient({
        chain,
        privateKey,
        rpcUrl,
      });
      const support = await gateway.supports(resourceUrl).catch(() => ({
        supported: false as const,
      }));
      if (support.supported) {
        console.info(`[x402] Gateway batching on ${chain} (${rpcUrl}) for ${resourceUrl}`);
        return chain;
      }
    }
  }

  const catalog = await getDiscoveryCatalogItem(resourceUrl);
  if (catalog?.accepts?.length) {
    const fromCatalog = gatewayChainFromDiscoveryAccepts(catalog.accepts, resourceUrl);
    if (fromCatalog) {
      console.info(`[x402] Gateway chain from Discovery catalog: ${fromCatalog} for ${resourceUrl}`);
      return fromCatalog;
    }
  }
  return null;
}

function parseResponseBody(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

type PaymentRequiredAccept = {
  network?: string;
  asset?: string;
  amount?: string;
  maxAmountRequired?: string;
};

type PaymentRequiredHeaderPayload = {
  accepts?: PaymentRequiredAccept[];
};

function chainIdFromEip155(network?: string): number | undefined {
  if (!network) return undefined;
  const m = network.match(/eip155:(\d+)/i);
  return m ? Number(m[1]) : undefined;
}

function parsePaymentRequiredAcceptsFromHeader(response: Response): PaymentRequiredAccept[] {
  const raw =
    response.headers.get("PAYMENT-REQUIRED") ?? response.headers.get("payment-required");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64").toString("utf8"),
    ) as PaymentRequiredHeaderPayload;
    return Array.isArray(parsed.accepts) ? parsed.accepts : [];
  } catch {
    return [];
  }
}

async function ensureGatewayLiquidity(
  gateway: GatewayClient,
  gatewayChain: GatewayChainKey,
  minUsdc: number,
): Promise<void> {
  const depositor = masterDepositorAddress();

  // Circle Gateway available balance via HTTP API (no RPC dependency — survives
  // broken POLYGON_RPC_URL such as wss:// endpoints).
  const gatewayBalance = await (
    gateway as unknown as {
      getBalance: (address?: string) => Promise<{ formattedAvailable: string }>;
    }
  ).getBalance(depositor);
  const apiAvailable = Number.parseFloat(gatewayBalance.formattedAvailable) || 0;

  // On-chain read is best-effort (extra safety when API lags); never blocks pay.
  let onChainAvailable = 0;
  try {
    const rpcUrls =
      gatewayChain === "polygon" ? polygonRpcCandidates() : rpcUrlCandidates();
    const onChainChain = gatewayChain === "polygon" ? "polygon" : "base";
    const snapshot = await getGatewayLiquiditySnapshot(
      depositor,
      gatewayBalance.formattedAvailable,
      rpcUrls,
      onChainChain,
    );
    onChainAvailable = snapshot.onChainAvailable;
  } catch (error) {
    console.warn("[gateway] on-chain liquidity read skipped:", error);
  }

  const effectiveAvailable = Math.max(apiAvailable, onChainAvailable);

  if (effectiveAvailable < minUsdc) {
    throw new CircleServiceError(
      `Circle Gateway thiếu USDC (${gatewayChain}): API ${apiAvailable.toFixed(6)}, on-chain ${onChainAvailable.toFixed(6)}, cần ~${minUsdc} (${depositor}). ` +
        `Surf cần Gateway trên Polygon — nạp USDC + MATIC gas cho master, hoặc npm run gateway:deposit trên đúng chain.`,
      "INSUFFICIENT_BALANCE",
    );
  }

  if (apiAvailable < minUsdc && onChainAvailable >= minUsdc) {
    console.info(
      `[gateway] API balance lag (${apiAvailable} USDC); paying from on-chain ${onChainAvailable} USDC`,
    );
  }
}

async function payViaGateway(
  gateway: GatewayClient,
  privateKey: `0x${string}`,
  gatewayChain: GatewayChainKey,
  resourceUrl: string,
  minUsdc: number,
  init?: X402PayRequestInit,
): Promise<X402PayResult> {
  await ensureGatewayLiquidity(gateway, gatewayChain, minUsdc);

  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...init?.headers,
  };
  const serializedBody =
    init?.body === undefined
      ? undefined
      : typeof init.body === "string"
        ? init.body
        : JSON.stringify(init.body);

  const initialResponse = await fetch(resourceUrl, {
    method,
    headers,
    body: serializedBody,
  });
  const initialText = await initialResponse.text();

  let batchingOption: PaymentRequiredAccept | undefined;
  let paymentRequired: { x402Version?: number; resource?: unknown };

  if (initialResponse.status === 402) {
    const accepts = parsePaymentRequiredAcceptsFromHeader(initialResponse);
    batchingOption = pickGatewayBatchingOption(accepts, gatewayChain);
    const raw =
      initialResponse.headers.get("PAYMENT-REQUIRED") ??
      initialResponse.headers.get("payment-required");
    paymentRequired = raw
      ? (JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as {
          x402Version?: number;
          resource?: unknown;
        })
      : { x402Version: 2 };
  } else {
    const catalog = await getDiscoveryCatalogItem(resourceUrl);
    const catalogAccepts = (catalog?.accepts ?? []) as PaymentRequiredAccept[];
    batchingOption = pickGatewayBatchingOption(catalogAccepts, gatewayChain);
    if (!batchingOption) {
      const data = parseResponseBody(initialText);
      if (!initialResponse.ok) {
        throw new CircleServiceError(
          `Gateway preflight failed (${initialResponse.status}): ${initialText.slice(0, 500)}`,
          "SETTLEMENT_FAILED",
        );
      }
      return { status: initialResponse.status, data };
    }
    console.info(
      `[x402] Discovery catalog Gateway pay (${initialResponse.status} from ${new URL(resourceUrl).hostname})`,
    );
    paymentRequired = {
      x402Version: (catalog as { x402Version?: number } | undefined)?.x402Version ?? 2,
      resource: { url: resourceUrl },
      accepts: catalogAccepts,
    };
  }

  if (!batchingOption) {
    throw new CircleServiceError(
      `No GatewayWalletBatched option for ${expectedNetworkForGatewayChain(gatewayChain)}`,
      "SETTLEMENT_FAILED",
    );
  }

  const paymentPayload = await (gateway as unknown as {
    createPaymentPayload: (
      version: number,
      requirements: PaymentRequiredAccept,
    ) => Promise<Record<string, unknown>>;
  }).createPaymentPayload(paymentRequired.x402Version ?? 2, batchingOption);

  const paymentHeader = Buffer.from(
    JSON.stringify({
      ...paymentPayload,
      resource: paymentRequired.resource,
      accepted: batchingOption,
    }),
  ).toString("base64");

  const paidResponse = await fetch(resourceUrl, {
    method,
    headers: {
      ...headers,
      "Payment-Signature": paymentHeader,
    },
    body: serializedBody,
  });

  const paidText = await paidResponse.text();
  const paidData = parseResponseBody(paidText);
  if (!paidResponse.ok) {
    const detail =
      typeof paidData === "object" && paidData
        ? JSON.stringify(paidData).slice(0, 800)
        : paidText.slice(0, 800);
    throw new CircleServiceError(
      `Gateway payment failed (${paidResponse.status}) on ${expectedNetworkForGatewayChain(gatewayChain)}: ${detail}`,
      "SETTLEMENT_FAILED",
    );
  }

  return { status: paidResponse.status, data: paidData };
}

async function payViaExactEvm(
  resourceUrl: string,
  chainId: SupportedChainId,
  minUsdc: number,
  init?: X402PayRequestInit,
): Promise<X402PayResult> {
  if (chainId === 8453) {
    await ensureMasterWalletUsdcOnBase(minUsdc);
  }

  const env = getServerEnv();
  const account = privateKeyToAccount(env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`);

  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...init?.headers,
  };
  const body =
    init?.body === undefined
      ? undefined
      : typeof init.body === "string"
        ? init.body
        : JSON.stringify(init.body);

  const doFetch = () =>
    fetch(resourceUrl, {
      method,
      headers,
      body: method === "GET" || method === "DELETE" ? undefined : body,
    });

  let response = await doFetch();

  if (response.status === 402) {
    const accepts = parsePaymentRequiredAcceptsFromHeader(response);
    const requiredChainIds = accepts
      .map((a) => chainIdFromEip155(a.network))
      .filter((id): id is number => Number.isFinite(id));
    const candidateChains = Array.from(new Set([chainId, ...requiredChainIds, 8453, 137]));
    const schemeOptions: Record<number, { rpcUrl: string }> = {};
    for (const c of candidateChains) {
      const rpcUrl = rpcUrlForChain(c);
      if (rpcUrl) schemeOptions[c] = { rpcUrl };
    }

    const coreClient = new x402Client();
    registerExactEvmScheme(coreClient, {
      signer: account,
      networks: candidateChains.map((c) => `eip155:${c}`),
      schemeOptions,
    });
    const httpClient = new x402HTTPClient(coreClient);

    const body402 = await response
      .clone()
      .json()
      .catch(() => undefined);
    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => response.headers.get(name),
      body402,
    );
    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    response = await fetch(resourceUrl, {
      method,
      headers: { ...headers, ...paymentHeaders },
      body: method === "GET" || method === "DELETE" ? undefined : body,
    });
  }

  const text = await response.text();
  const data = parseResponseBody(text);

  if (response.status >= 400) {
    const errBody =
      typeof data === "object" && data && "error" in data
        ? String((data as { error?: unknown }).error)
        : text.slice(0, 300);
    throw new CircleServiceError(
      `API trả HTTP ${response.status} sau thanh toán x402: ${errBody}`,
      "SETTLEMENT_FAILED",
    );
  }

  return { status: response.status, data };
}

/**
 * Pay for an x402 resource using the master agent wallet.
 * Auto-selects Gateway batching vs standard exact (Messari).
 */
export async function payX402Resource(
  resourceUrl: string,
  chainId: SupportedChainId,
  minUsdc: number,
  init?: X402PayRequestInit,
): Promise<X402PayResult> {
  const env = getServerEnv();
  const privateKey = env.MASTER_AGENT_PRIVATE_KEY as `0x${string}`;

  const gatewayChain = await resolveGatewayChainForResource(resourceUrl, privateKey);
  if (gatewayChain) {
    let lastGatewayError: unknown;
    for (const rpcUrl of rpcCandidatesForGatewayChain(gatewayChain)) {
      const gateway = new GatewayClient({
        chain: gatewayChain,
        privateKey,
        rpcUrl,
      });
      try {
        return await payViaGateway(gateway, privateKey, gatewayChain, resourceUrl, minUsdc, init);
      } catch (error) {
        lastGatewayError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("Gateway batching") ||
          message.includes("No Gateway batching")
        ) {
          return payViaExactEvm(resourceUrl, chainId, minUsdc, init);
        }
        const isNetworkFailure =
          message.includes("fetch failed") ||
          message.includes("request failed") ||
          message.includes("NETWORK_ERROR");
        if (isNetworkFailure) {
          console.warn(`[x402] Gateway pay retry with next RPC after failure on ${rpcUrl}:`, message);
          continue;
        }
        throw error;
      }
    }
    if (lastGatewayError) throw lastGatewayError;
  }

  // Messari and other exact EIP-3009 sellers (not GatewayWalletBatched).
  const legacyGateway = new GatewayClient({
    chain: gatewayChainKeyForChainId(chainId),
    privateKey,
    rpcUrl: env.BASE_RPC_URL,
  });
  const legacySupport = await legacyGateway.supports(resourceUrl).catch(() => ({
    supported: false as const,
  }));
  if (legacySupport.supported) {
    return payViaGateway(
      legacyGateway,
      privateKey,
      gatewayChainKeyForChainId(chainId),
      resourceUrl,
      minUsdc,
      init,
    );
  }

  return payViaExactEvm(resourceUrl, chainId, minUsdc, init);
}
