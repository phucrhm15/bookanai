/** Stored in SQLite `ledger_entries.label` — translated on the client via `formatLedgerLabel`. */
const PREFIX = "i18n:" as const;

export function ledgerLabelDepositSync(): string {
  return `${PREFIX}deposit.sync`;
}

export function ledgerLabelX402(agentServiceId: string): string {
  return `${PREFIX}x402:${agentServiceId}`;
}

export function ledgerLabelRefundX402(agentServiceId: string): string {
  return `${PREFIX}refund.x402:${agentServiceId}`;
}

export function ledgerLabelRefundPending(ledgerEntryId: string): string {
  return `${PREFIX}refund.pending:${ledgerEntryId.slice(0, 12)}`;
}

export function ledgerLabelRefundHold(settlementId: string): string {
  return `${PREFIX}refund.hold:${settlementId.slice(0, 14)}`;
}
