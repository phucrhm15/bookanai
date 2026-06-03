/** Parse x402 HTTP 402 PAYMENT-REQUIRED header → USDC price for a chain. */
export type X402ProbeInit = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
};

export type X402ProbeResult = {
  status: number;
  paymentRequired: boolean;
  /** Agent-listed price in USDC (6 decimals). */
  priceUsdc: number;
  /** Chain id used to read price from Discovery accepts (may differ from caller hint). */
  priceChainId?: number;
};

type PaymentAccept = {
  scheme?: string;
  network?: string;
  amount?: string;
  maxAmountRequired?: string;
};

type PaymentRequiredPayload = {
  accepts?: PaymentAccept[];
};

function atomicUsdcToNumber(raw: string): number {
  const micro = BigInt(raw);
  return Number(micro) / 1_000_000;
}

function pickAcceptForChain(accepts: PaymentAccept[], chainId: number): PaymentAccept | undefined {
  const expected = `eip155:${chainId}`;
  return (
    accepts.find((a) => a.network === expected) ??
    accepts.find((a) => a.network?.includes(String(chainId)))
  );
}

export function priceUsdcFromDiscoveryAccepts(
  accepts: PaymentAccept[] | undefined,
  chainId: number,
): number | null {
  if (!accepts?.length) return null;
  const match = pickAcceptForChain(accepts, chainId);
  const raw = match?.amount ?? match?.maxAmountRequired;
  if (!raw) return null;
  try {
    return atomicUsdcToNumber(raw);
  } catch {
    return null;
  }
}

/** Prefer caller chain, then Base / Polygon / Ethereum mainnet catalog prices. */
export function priceUsdcFromDiscoveryAnyChain(
  accepts: PaymentAccept[] | undefined,
  preferredChainId: number,
): { priceUsdc: number; chainId: number } | null {
  const chainOrder = Array.from(
    new Set([preferredChainId, 8453, 137, 1].filter((id) => Number.isFinite(id))),
  );
  for (const chainId of chainOrder) {
    const priceUsdc = priceUsdcFromDiscoveryAccepts(accepts, chainId);
    if (priceUsdc !== null && priceUsdc > 0) {
      return { priceUsdc, chainId };
    }
  }
  return null;
}

function priceFromPaymentRequiredHeader(header: string, chainId: number): number | null {
  try {
    const json = JSON.parse(Buffer.from(header, "base64").toString("utf-8")) as PaymentRequiredPayload;
    return priceUsdcFromDiscoveryAccepts(json.accepts, chainId);
  } catch {
    return null;
  }
}

/**
 * Probe marketplace resource — HTTP 402 preferred; Discovery catalog price is fallback
 * (POST-only sellers like AIsa Perplexity often return 401/502 on GET probe).
 */
export async function probeX402ResourcePrice(
  resourceUrl: string,
  chainId: number,
  discoveryAccepts?: PaymentAccept[],
  init?: X402ProbeInit,
): Promise<X402ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...init?.headers,
  };
  const serializedBody =
    init?.body === undefined
      ? undefined
      : typeof init.body === "string"
        ? init.body
        : JSON.stringify(init.body);

  try {
    let accepts = discoveryAccepts;
    if (!accepts?.length) {
      const { getDiscoveryCatalogItem } = await import("@/services/agent-service-map");
      const catalog = await getDiscoveryCatalogItem(resourceUrl).catch(() => undefined);
      accepts = catalog?.accepts as PaymentAccept[] | undefined;
    }

    const res = await fetch(resourceUrl, {
      method,
      headers,
      body: method === "GET" || method === "DELETE" ? undefined : serializedBody,
      signal: controller.signal,
    });

    if (res.status === 402) {
      const header = res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required");
      const fromHeader = header ? priceFromPaymentRequiredHeader(header, chainId) : null;
      const fromDiscovery = priceUsdcFromDiscoveryAnyChain(accepts, chainId);
      const priceUsdc = fromHeader ?? fromDiscovery?.priceUsdc ?? null;

      if (priceUsdc === null || !Number.isFinite(priceUsdc) || priceUsdc <= 0) {
        throw new Error(
          `Agent x402 trả 402 nhưng không có mức giá USDC hợp lệ cho chain ${chainId}`,
        );
      }

      return {
        status: 402,
        paymentRequired: true,
        priceUsdc,
        priceChainId: fromDiscovery?.chainId ?? chainId,
      };
    }

    const fromDiscovery = priceUsdcFromDiscoveryAnyChain(accepts, chainId);
    if (fromDiscovery) {
      return {
        status: res.status,
        paymentRequired: false,
        priceUsdc: fromDiscovery.priceUsdc,
        priceChainId: fromDiscovery.chainId,
      };
    }

    throw new Error(
      `Agent không phát hành x402 402 (got HTTP ${res.status}) và không có giá trong Discovery metadata`,
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Probe x402 marketplace timed out after 30s");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
