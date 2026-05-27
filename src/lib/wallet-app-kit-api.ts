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

export async function fetchAppKitMeta(): Promise<AppKitMeta> {
  const res = await apiFetch("/api/wallet/app-kit");
  if (!res.ok) {
    throw new Error("Could not load App Kit settings");
  }
  return res.json() as Promise<AppKitMeta>;
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
    throw new Error((data as { error?: string }).error ?? "App Kit action failed");
  }
  return data as { state: string; txHash?: string };
}
