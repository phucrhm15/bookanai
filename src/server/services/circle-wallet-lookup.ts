import type { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { BASE_USDC_CONTRACT_ADDRESS } from "@/lib/chains";

type DcwClient = ReturnType<typeof initiateDeveloperControlledWalletsClient>;

export type ExistingCircleWallet = {
  id: string;
  address: string;
  usdcBalance: number;
};

function readRefId(wallet: Record<string, unknown>): string | undefined {
  if (typeof wallet.refId === "string" && wallet.refId.trim()) {
    return wallet.refId.trim();
  }
  const meta = wallet.metadata;
  if (!Array.isArray(meta)) return undefined;
  for (const item of meta) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const refId = row.refId;
    if (typeof refId === "string" && refId.trim()) {
      return refId.trim();
    }
  }
  return undefined;
}

async function fetchUsdcBalance(client: DcwClient, walletId: string): Promise<number> {
  try {
    const res = await client.getWalletTokenBalance({
      id: walletId,
      tokenAddresses: [BASE_USDC_CONTRACT_ADDRESS],
    });
    const amount = res.data?.tokenBalances?.[0]?.amount;
    const n = typeof amount === "string" ? Number(amount) : Number(amount ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Reuse an existing Circle wallet for this Clerk user (metadata refId) instead of createWallets.
 * When several wallets share the same refId, pick the one with the highest Base USDC balance.
 */
export async function findExistingCircleWalletForClerk(
  client: DcwClient,
  walletSetId: string,
  clerkId: string,
): Promise<ExistingCircleWallet | null> {
  const matches: { id: string; address: string }[] = [];
  let pageAfter: string | undefined;

  for (let page = 0; page < 50; page++) {
    const res = await client.listWallets({
      walletSetId,
      pageSize: 50,
      ...(pageAfter ? { pageAfter } : {}),
    });
    const wallets = res.data?.wallets ?? [];
    for (const w of wallets) {
      if (!w?.id || !w.address) continue;
      const row = w as unknown as Record<string, unknown>;
      if (readRefId(row) === clerkId) {
        matches.push({ id: w.id, address: w.address });
      }
    }
    pageAfter = res.data?.pagination?.nextPageAfter;
    if (!pageAfter || wallets.length === 0) break;
  }

  if (!matches.length) return null;

  let best: ExistingCircleWallet | null = null;
  for (const m of matches) {
    const usdcBalance = await fetchUsdcBalance(client, m.id);
    if (
      !best ||
      usdcBalance > best.usdcBalance ||
      (usdcBalance === best.usdcBalance && m.id < best.id)
    ) {
      best = { ...m, usdcBalance };
    }
  }

  if (matches.length > 1 && best) {
    console.warn(
      `[circle-wallet-lookup] ${matches.length} Circle wallets for clerkId=${clerkId}; ` +
        `reusing ${best.address} (${best.usdcBalance} USDC)`,
    );
  }

  return best;
}
