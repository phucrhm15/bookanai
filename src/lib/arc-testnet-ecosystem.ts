import { ARC_CHAIN_ID, ARC_USDC_CONTRACT_ADDRESS } from "@/lib/chains";
import {
  ARC_MEMO_CONTRACT_ADDRESS,
  ARC_MULTICALL3_FROM_ADDRESS,
} from "@/lib/arc-transaction-extensions";

/** EIP-3089 params for wallet_addEthereumChain (Arc Testnet). */
export const ARC_WALLET_CHAIN_PARAMS = {
  chainId: `0x${ARC_CHAIN_ID.toString(16)}`,
  chainName: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: ["https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://testnet.arcscan.app"],
} as const;

export type ArcEcosystemTool = {
  id: string;
  nameKey: string;
  descKey: string;
  url: string;
  category: "faucet" | "bridge" | "swap" | "explorer" | "defi" | "docs";
};

export const ARC_FAUCET_URL = "https://faucet.circle.com";

export const ARC_ECOSYSTEM_TOOLS: ArcEcosystemTool[] = [
  {
    id: "faucet",
    nameKey: "toolFaucet",
    descKey: "toolFaucetDesc",
    url: ARC_FAUCET_URL,
    category: "faucet",
  },
  {
    id: "explorer",
    nameKey: "toolExplorer",
    descKey: "toolExplorerDesc",
    url: "https://testnet.arcscan.app",
    category: "explorer",
  },
  {
    id: "cctp-bridge",
    nameKey: "toolCctp",
    descKey: "toolCctpDesc",
    url: "https://docs.arc.io/integrate/exchanges/cctp-bridging",
    category: "bridge",
  },
  {
    id: "arc-docs",
    nameKey: "toolDocs",
    descKey: "toolDocsDesc",
    url: "https://docs.arc.io",
    category: "docs",
  },
  {
    id: "deploy",
    nameKey: "toolDeploy",
    descKey: "toolDeployDesc",
    url: "https://docs.arc.io/build/quickstart",
    category: "docs",
  },
  {
    id: "app-kit",
    nameKey: "toolAppKit",
    descKey: "toolAppKitDesc",
    url: "https://developers.circle.com/app-kit",
    category: "defi",
  },
  {
    id: "uniswap",
    nameKey: "toolUniswap",
    descKey: "toolUniswapDesc",
    url: "https://app.uniswap.org/swap",
    category: "swap",
  },
  {
    id: "contracts",
    nameKey: "toolContracts",
    descKey: "toolContractsDesc",
    url: "https://developers.circle.com/contracts",
    category: "defi",
  },
  {
    id: "eurc",
    nameKey: "toolEurc",
    descKey: "toolEurcDesc",
    url: "https://docs.arc.io",
    category: "defi",
  },
];

export const ARC_NETWORK_FACTS = {
  chainId: ARC_CHAIN_ID,
  rpcUrl: "https://rpc.testnet.arc.network",
  explorerUrl: "https://testnet.arcscan.app",
  usdcContract: ARC_USDC_CONTRACT_ADDRESS,
  eurcContract: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  cctpDomain: 26,
  /** Arc v0.7.2 — transaction memos (Zero7 hardfork). */
  memoContract: ARC_MEMO_CONTRACT_ADDRESS,
  /** Arc v0.7.2 — batched transactions preserving msg.sender. */
  multicall3FromContract: ARC_MULTICALL3_FROM_ADDRESS,
  hardforkVersion: "v0.7.2",
  hardforkActivationUtc: "2026-06-18T12:00:00Z",
} as const;

const ARC_TOKEN_TO_UNISWAP_ADDRESS: Record<string, string> = {
  USDC: ARC_USDC_CONTRACT_ADDRESS,
  EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
};

/**
 * Build a prefilled Uniswap URL for Arc.
 * Falls back to symbol text when a token address is unknown.
 */
export function buildUniswapArcSwapUrl(input: {
  tokenIn?: string;
  tokenOut?: string;
  amount?: string;
}): string {
  const params = new URLSearchParams();
  params.set("chain", "arc");

  const inToken = (input.tokenIn ?? "").toUpperCase();
  const outToken = (input.tokenOut ?? "").toUpperCase();
  const inValue = ARC_TOKEN_TO_UNISWAP_ADDRESS[inToken] ?? inToken;
  const outValue = ARC_TOKEN_TO_UNISWAP_ADDRESS[outToken] ?? outToken;

  if (inValue) params.set("inputCurrency", inValue);
  if (outValue) params.set("outputCurrency", outValue);
  if (input.amount && Number(input.amount) > 0) params.set("exactField", "input");
  if (input.amount && Number(input.amount) > 0) params.set("exactAmount", input.amount);

  return `https://app.uniswap.org/swap?${params.toString()}`;
}

export function arcExplorerAddressUrl(address: string): string {
  return `${ARC_NETWORK_FACTS.explorerUrl}/address/${address}`;
}

export function arcExplorerTxUrl(txHash: string): string {
  return `${ARC_NETWORK_FACTS.explorerUrl}/tx/${txHash}`;
}
