import { ARC_NETWORK, BASE_NETWORK, USDC_CONTRACT_ADDRESS } from "@/lib/mock-data";
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
  unifiedBalance?: UnifiedBalanceSnapshot;
  usdcContractAddress: string;
  networks?: {
    base: WalletNetworkInfo;
    arc: WalletNetworkInfo;
  };
  network: typeof ARC_NETWORK;
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
  paymentRequiredObserved?: boolean;
};

export const DEMO_USER_ID = "demo-user";

/** Call after user registration to provision their embedded Circle wallet. */
export async function provisionWallet(userId: string): Promise<Pick<WalletApiResponse, "userId" | "walletId" | "address" | "ledgerBalance" | "unifiedBalance">> {
  const res = await fetch("/api/wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to provision wallet");
  }
  return res.json();
}

export async function fetchWallet(userId: string = DEMO_USER_ID): Promise<WalletApiResponse> {
  const res = await fetch(`/api/wallet?userId=${encodeURIComponent(userId)}`);
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
): Promise<NanopaymentApiResponse> {
  const res = await fetch("/api/wallet/nanopayment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userWalletId, agentServiceId, targetChainId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Nanopayment failed");
  }
  return res.json() as Promise<NanopaymentApiResponse>;
}

export { USDC_CONTRACT_ADDRESS, BASE_NETWORK, ARC_NETWORK };
