/** Parse x402 HTTP 402 PAYMENT-REQUIRED header → USDC price for a chain. */
export type X402ProbeResult = {
  status: number;
  paymentRequired: boolean;
  /** Agent-listed price in USDC (6 decimals). */
  priceUsdc: number;
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

function priceFromPaymentRequiredHeader(header: string, chainId: number): number | null {
  try {
    const json = JSON.parse(Buffer.from(header, "base64").toString("utf-8")) as PaymentRequiredPayload;
    return priceUsdcFromDiscoveryAccepts(json.accepts, chainId);
  } catch {
    return null;
  }
}

/**
 * Probe marketplace resource — must return HTTP 402 with a payable amount for the chain.
 */
export async function probeX402ResourcePrice(
  resourceUrl: string,
  chainId: number,
  discoveryAccepts?: PaymentAccept[],
): Promise<X402ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(resourceUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (res.status === 402) {
      const header = res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required");
      const fromHeader = header ? priceFromPaymentRequiredHeader(header, chainId) : null;
      const fromDiscovery = priceUsdcFromDiscoveryAccepts(discoveryAccepts, chainId);
      const priceUsdc = fromHeader ?? fromDiscovery;

      if (priceUsdc === null || !Number.isFinite(priceUsdc) || priceUsdc <= 0) {
        throw new Error(
          `Agent x402 trả 402 nhưng không có mức giá USDC hợp lệ cho chain ${chainId}`,
        );
      }

      return { status: 402, paymentRequired: true, priceUsdc };
    }

    const fallback = priceUsdcFromDiscoveryAccepts(discoveryAccepts, chainId);
    if (fallback !== null && fallback > 0) {
      return { status: res.status, paymentRequired: false, priceUsdc: fallback };
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
