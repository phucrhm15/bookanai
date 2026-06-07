import { ARC_CHAIN_ID, ARC_USDC_CONTRACT_ADDRESS } from "@/lib/chains";

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
} as const;

export function arcExplorerAddressUrl(address: string): string {
  return `${ARC_NETWORK_FACTS.explorerUrl}/address/${address}`;
}

export function arcExplorerTxUrl(txHash: string): string {
  return `${ARC_NETWORK_FACTS.explorerUrl}/tx/${txHash}`;
}
