/** Max wait for master agent x402 Gateway.pay (marketplace X post generation). */
export const MARKETPLACE_SETTLE_TIMEOUT_MS = 10_000;

/** Poll Circle DCW transfer until terminal state. */
export const ONCHAIN_TRANSFER_POLL_TIMEOUT_MS = 90_000;
export const ONCHAIN_TRANSFER_POLL_INTERVAL_MS = 1_500;

/** Upper bound for nanopayment API handler (x402 Gateway pay; on-chain is batched). */
export const NANOPAYMENT_ROUTE_BUDGET_MS = 45_000;
