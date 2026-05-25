const MICRO = 1_000_000;

export function usdcToMicro(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Invalid USDC amount");
  }
  return Math.round(amount * MICRO);
}

export function microToUsdc(micro: number): number {
  return micro / MICRO;
}

/** New users start at 0 until synced from Circle on-chain balance. */
export const INITIAL_LEDGER_MICRO_USDC = 0;
