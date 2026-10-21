export type WalletTransaction = {
  id: string;
  label: string;
  amount: number;
  agent?: string;
  timestamp: string;
  kind?: "nanopayment" | "deposit" | "withdraw" | "refund";
};
