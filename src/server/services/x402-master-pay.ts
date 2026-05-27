/**
 * Master-agent x402 payment router.
 * - Circle Gateway batching (AIsa / Discovery sellers)
 * - Standard EIP-3009 exact (Messari and other non-Gateway sellers)
 */
import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import {
  gatewayChainKeyForChainId,
  type SupportedChainId,
} from "@/lib/chains";
import { getGatewayLiquiditySnapshot } from "@/lib/gateway-onchain-balance";
import { sanitizeRpcUrls } from "@/lib/rpc-urls";
import { getServerEnv } from "@/server/config/env";
import { CircleServiceError } from "@/services/circle-errors";

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
    env.POLYGON_RPC_URL,
    "https://polygon.llamarpc.com",
    "https://1rpc.io/matic",
    "https://rpc.ankr.com/polygon",
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

function rpcUrlForGatewayChain(chain: GatewayChainKey): string {
  if (chain === "polygon") return requirePolygonRpc();
  if (chain === "base") return rpcUrlCandidates()[0] ?? getServerEnv().BASE_RPC_URL;
  return getServerEnv().ARC_RPC_URL;
}

async function resolveGatewayChainForResource(
  resourceUrl: string,
  privateKey: `0x${string}`,
): Promise<GatewayChainKey | null> {
  // Surf / nano.blockrun require GatewayWalletBatched on Polygon — try polygon before base.
  const order: GatewayChainKey[] = ["polygon", "base", "arcTestnet"];
  for (const chain of order) {
    const gateway = new GatewayClient({
      chain,
      privateKey,
      rpcUrl: rpcUrlForGatewayChain(chain),
    });
    const support = await gateway.supports(resourceUrl).catch(() => ({
      supported: false as const,
    }));
    if (support.supported) {
      console.info(`[x402] Gateway batching on ${chain} for ${resourceUrl}`);
      return chain;
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
  const balances = await gateway.getBalances();
  const depositor = masterDepositorAddress();
  const rpcUrls =
    gatewayChain === "polygon" ? polygonRpcCandidates() : rpcUrlCandidates();
  const onChainChain = gatewayChain === "polygon" ? "polygon" : "base";
  const snapshot = await getGatewayLiquiditySnapshot(
    depositor,
    balances.gateway.formattedAvailable,
    rpcUrls,
    onChainChain,
  );

  if (snapshot.effectiveAvailable < minUsdc) {
    throw new CircleServiceError(
      `Circle Gateway thiếu USDC (${gatewayChain}): API ${snapshot.apiAvailable.toFixed(6)}, on-chain ${snapshot.onChainAvailable.toFixed(6)}, cần ~${minUsdc}. ` +
        `Ví Master EOA: ${balances.wallet.formatted} USDC (${depositor}). ` +
        `Surf cần Gateway trên Polygon — nạp USDC + MATIC gas cho master, hoặc npm run gateway:deposit trên đúng chain.`,
      "INSUFFICIENT_BALANCE",
    );
  }

  if (snapshot.apiAvailable < minUsdc && snapshot.onChainAvailable >= minUsdc) {
    console.info(
      `[gateway] API balance lag (${snapshot.apiAvailable} USDC); paying from on-chain ${snapshot.onChainAvailable} USDC`,
    );
  }
}

async function payViaGateway(
  gateway: GatewayClient,
  gatewayChain: GatewayChainKey,
  resourceUrl: string,
  minUsdc: number,
  init?: X402PayRequestInit,
): Promise<X402PayResult> {
  await ensureGatewayLiquidity(gateway, gatewayChain, minUsdc);
  const result = await gateway.pay(resourceUrl, {
    method: init?.method ?? "GET",
    headers: init?.headers,
    body: init?.body,
  });
  return { status: result.status ?? 200, data: result.data };
}

async function payViaExactEvm(
  resourceUrl: string,
  chainId: SupportedChainId,
  minUsdc: number,
  init?: X402PayRequestInit,
): Promise<X402PayResult> {
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
    const gateway = new GatewayClient({
      chain: gatewayChain,
      privateKey,
      rpcUrl: rpcUrlForGatewayChain(gatewayChain),
    });
    try {
      return await payViaGateway(gateway, gatewayChain, resourceUrl, minUsdc, init);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("Gateway batching") ||
        message.includes("No Gateway batching")
      ) {
        return payViaExactEvm(resourceUrl, chainId, minUsdc, init);
      }
      throw error;
    }
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
      gatewayChainKeyForChainId(chainId),
      resourceUrl,
      minUsdc,
      init,
    );
  }

  return payViaExactEvm(resourceUrl, chainId, minUsdc, init);
}
