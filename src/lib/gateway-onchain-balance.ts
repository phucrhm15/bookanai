import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { BASE_USDC_CONTRACT_ADDRESS } from "@/lib/chains";

/** Circle Gateway Wallet on EVM mainnets (Base domain 6). */
export const MAINNET_GATEWAY_WALLET_ADDRESS =
  "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE" as const;

const gatewayWalletAbi = parseAbi([
  "function availableBalance(address token, address depositor) view returns (uint256)",
]);

/** On-chain spendable USDC in Gateway (source of truth; API can lag after deposit). */
export async function readOnChainGatewayAvailableUsdc(
  depositor: `0x${string}`,
  rpcUrl?: string,
): Promise<number> {
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl ?? "https://mainnet.base.org"),
  });
  const raw = await client.readContract({
    address: MAINNET_GATEWAY_WALLET_ADDRESS,
    abi: gatewayWalletAbi,
    functionName: "availableBalance",
    args: [BASE_USDC_CONTRACT_ADDRESS, depositor],
  });
  return Number.parseFloat(formatUnits(raw, 6));
}

export type GatewayLiquiditySnapshot = {
  apiAvailable: number;
  onChainAvailable: number;
  effectiveAvailable: number;
};

/** Circle Gateway API often lags after deposit — prefer max(API, on-chain). */
export async function getGatewayLiquiditySnapshot(
  depositor: `0x${string}`,
  apiFormattedAvailable: string,
  rpcUrls: string[],
): Promise<GatewayLiquiditySnapshot> {
  const apiAvailable = Number.parseFloat(apiFormattedAvailable);
  let onChainAvailable = 0;
  let lastError: unknown;

  for (const rpcUrl of rpcUrls) {
    if (!rpcUrl) continue;
    try {
      onChainAvailable = await readOnChainGatewayAvailableUsdc(depositor, rpcUrl);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn("[gateway] on-chain balance read failed:", lastError);
  }

  const effectiveAvailable = Math.max(
    Number.isFinite(apiAvailable) ? apiAvailable : 0,
    onChainAvailable,
  );

  return {
    apiAvailable: Number.isFinite(apiAvailable) ? apiAvailable : 0,
    onChainAvailable,
    effectiveAvailable,
  };
}
