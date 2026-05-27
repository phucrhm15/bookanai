const apiFetch = (input: string, init?: RequestInit) =>
  fetch(input, { ...init, credentials: "same-origin" });

export type AppKitMeta = {
  swapEnabled: boolean;
  paymentChains: { chainId: number; appKitChain: string; label: string }[];
};

export type AppKitBalances = {
  totalFormatted: string;
  perChain: { chain: string; amount: string }[];
};

export type AppKitFunding = {
  address: string;
  ethOnBase: number;
  ethSufficient: boolean;
  recommendedEth: number;
  usdcOnBase: number;
  usdcOnArc: number;
};

export async function fetchAppKitMeta(): Promise<AppKitMeta> {
  const res = await apiFetch("/api/wallet/app-kit");
  if (!res.ok) {
    throw new Error("Could not load App Kit settings");
  }
  return res.json() as Promise<AppKitMeta>;
}

export async function fetchAppKitFunding(): Promise<AppKitFunding> {
  const res = await apiFetch("/api/wallet/app-kit?op=funding");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Funding status failed");
  }
  return res.json() as Promise<AppKitFunding>;
}

export async function fetchAppKitBalances(): Promise<AppKitBalances> {
  const res = await apiFetch("/api/wallet/app-kit?op=balances");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Balances failed");
  }
  return res.json() as Promise<AppKitBalances>;
}

export async function fetchAppKitChains(
  kind: "bridge" | "swap" | "unifiedBalance" = "bridge",
): Promise<string[]> {
  const res = await apiFetch(`/api/wallet/app-kit?op=chains&kind=${kind}`);
  if (!res.ok) throw new Error("Could not load chains");
  const data = (await res.json()) as { chains: string[] };
  return data.chains;
}

export async function postAppKitAction(body: Record<string, string>): Promise<{
  state: string;
  txHash?: string;
}> {
  const res = await apiFetch("/api/wallet/app-kit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data as { error?: string; code?: string };
    const e = new Error(err.error ?? "App Kit action failed") as Error & { code?: string };
    e.code = err.code;
    throw e;
  }
  return data as { state: string; txHash?: string };
}
