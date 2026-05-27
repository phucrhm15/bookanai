import { createPublicClient, formatEther, http } from "viem";
import { base } from "viem/chains";
import { getServerEnv } from "@/server/config/env";

/** Minimum ETH on Base to attempt DCW on-chain txs (deposit / bridge). */
export const MIN_BASE_ETH_FOR_GAS = 0.000_05;

/** Suggested top-up so users do not hit failures mid-flow. */
export const RECOMMENDED_BASE_ETH = 0.001;

let baseClient: ReturnType<typeof createPublicClient> | undefined;

function getBaseClient() {
  if (!baseClient) {
    const env = getServerEnv();
    baseClient = createPublicClient({
      chain: base,
      transport: http(env.BASE_RPC_URL),
    });
  }
  return baseClient;
}

export async function getEthBalanceOnBase(address: `0x${string}`): Promise<number> {
  const wei = await getBaseClient().getBalance({ address });
  return Number.parseFloat(formatEther(wei));
}

/** EVM chains where Circle DCW EOA pays gas in native ETH (not USDC). */
export function chainNeedsEthForGas(chain: string): boolean {
  const c = chain.trim();
  return c === "Base" || c === "Ethereum";
}
