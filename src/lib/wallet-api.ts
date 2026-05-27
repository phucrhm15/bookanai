import { ARC_NETWORK, BASE_NETWORK, USDC_CONTRACT_ADDRESS } from "@/lib/mock-data";
import { formatPaymentErrorForUser } from "@/lib/payment-error-messages";
import type { UnifiedBalanceSnapshot } from "@/lib/wallet-types";

export type WalletNetworkInfo = {
  name: string;
  id: number;
  usdcContractAddress: string;
  depositWarning?: string;
};

export type WalletApiResponse = {
  userId: string;
  walletId: string;
  address: string;
  ledgerBalance: number;
  /** min(ledger, on-chain − settlement hold) — what Studio can spend */
  spendableCreditsUsdc?: number;
  settlementHoldUsdc?: number;
  onChainUsdc?: number;
  unifiedBalance?: UnifiedBalanceSnapshot;
  usdcContractAddress: string;
  networks?: {
    base: WalletNetworkInfo;
    arc: WalletNetworkInfo;
  };
  network: typeof ARC_NETWORK;
  preferredChainId?: number;
  transactions: {
    id: string;
    label: string;
    amount: number;
    agent?: string;
    timestamp: string;
    kind?: "nanopayment" | "deposit" | "withdraw";
  }[];
};

export type NanopaymentApiResponse = {
  agentServiceId: string;
  resourceUrl: string;
  targetChainId: number;
  chargedUsdc: number;
  ledgerBalance: number;
  unifiedBalance: number;
  responseStatus: number;
  responsePreview: string;
  rawResponse: string;
  generatedContent: string;
  paymentRequiredObserved?: boolean;
  onChainSettlementTxId?: string;
  onChainSettlementQueuedId?: string;
};

const apiFetch = (input: string, init?: RequestInit) =>
  fetch(input, { ...init, credentials: "same-origin" });

/** Provision embedded Circle wallet for the signed-in Clerk user. */
export async function provisionWallet(): Promise<
  Pick<WalletApiResponse, "userId" | "walletId" | "address" | "ledgerBalance" | "unifiedBalance">
> {
  const res = await apiFetch("/api/wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to provision wallet");
  }
  return res.json();
}

/** Load wallet for the signed-in Clerk user (session cookie). */
export async function fetchWallet(): Promise<WalletApiResponse> {
  const res = await apiFetch("/api/wallet");
  if (res.status === 401) {
    throw new Error("Sign in required");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to load wallet");
  }
  return res.json() as Promise<WalletApiResponse>;
}

export async function postNanopayment(
  userWalletId: string,
  agentServiceId: string,
  targetChainId?: number,
  prompt?: string,
  idempotencyKey?: string,
): Promise<NanopaymentApiResponse> {
  const res = await apiFetch("/api/wallet/nanopayment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userWalletId,
      agentServiceId,
      targetChainId,
      prompt,
      idempotencyKey,
    }),
  });
  if (res.status === 401) {
    throw new Error("Sign in required");
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
      code?: string;
    } | null;
    const message =
      err?.error ??
      err?.message ??
      (res.statusText ? `${res.statusText} (HTTP ${res.status})` : `HTTP ${res.status}`);
    throw new Error(formatPaymentErrorForUser(message));
  }
  return res.json() as Promise<NanopaymentApiResponse>;
}

export { USDC_CONTRACT_ADDRESS, BASE_NETWORK, ARC_NETWORK };
