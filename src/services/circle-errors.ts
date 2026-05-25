export class CircleServiceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_CONFIGURED"
      | "WALLET_NOT_FOUND"
      | "INSUFFICIENT_BALANCE"
      | "DUPLICATE_PAYMENT"
      | "UNSUPPORTED_CHAIN"
      | "PAYMENT_REQUIRED"
      | "NETWORK_ERROR"
      | "SETTLEMENT_FAILED"
      | "TIMEOUT" = "SETTLEMENT_FAILED",
  ) {
    super(message);
    this.name = "CircleServiceError";
  }
}
