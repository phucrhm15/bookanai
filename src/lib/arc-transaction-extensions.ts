/**
 * Arc Testnet v0.7.2 transaction extensions — Memo + Multicall3From batching.
 * @see https://docs.arc.io/integrate/exchanges/withdrawals
 * @see https://docs.arc.io/arc/concepts/execution-layer
 */
import { encodeFunctionData, parseAbi, parseUnits, toHex } from "viem";
import { ARC_CHAIN_ID, type SupportedChainId } from "@/lib/chains";

/** Memo contract — attach metadata to USDC transfers (Zero7 / v0.7.2). */
export const ARC_MEMO_CONTRACT_ADDRESS =
  "0x9702466268ccF55eAB64cdf484d272Ac08d3b75b" as const;

/** Multicall3From — batch calls preserving original msg.sender (Zero7 / v0.7.2). */
export const ARC_MULTICALL3_FROM_ADDRESS =
  "0xEb7c69996e36d933e08216c278065b267598e980" as const;

export const ARC_MEMO_ABI = parseAbi([
  "function sendWithMemo(address to, uint256 amount, bytes memo)",
  "event Memo(address indexed from, address indexed to, uint256 amount, bytes memo)",
]);

export const ARC_MULTICALL3_FROM_ABI = parseAbi([
  "function aggregate3Value((address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
]);

export type ArcMemoType = "x402" | "deposit" | "refund" | "batch";

/** Structured on-chain memo for BookanAI reconciliation. */
export type ArcNanopaymentMemo = {
  v: 1;
  type: ArcMemoType;
  app: "bookanai";
  ledger?: string;
  agent?: string;
  settle?: string;
  batch?: string;
};

export type ArcBatchTransferItem = {
  destinationAddress: `0x${string}`;
  amountUsdc: number;
  memo: ArcNanopaymentMemo;
};

export function isArcChain(chainId: number): chainId is typeof ARC_CHAIN_ID {
  return chainId === ARC_CHAIN_ID;
}

/** ERC-20 USDC amount (6 decimals) for sendWithMemo `amount` param. */
export function usdcToErc20Atomic(amountUsdc: number): bigint {
  return parseUnits(amountUsdc.toFixed(6), 6);
}

/** Native USDC wei (18 decimals) for tx `value` on Arc. */
export function usdcToNativeWei(amountUsdc: number): bigint {
  return parseUnits(amountUsdc.toFixed(6), 18);
}

export function formatNativeUsdcForDcw(amountUsdc: number): string {
  const wei = usdcToNativeWei(amountUsdc);
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

export function buildArcNanopaymentMemo(input: {
  type?: ArcMemoType;
  ledgerEntryId?: string;
  agentId?: string;
  settlementId?: string;
  batchId?: string;
}): ArcNanopaymentMemo {
  return {
    v: 1,
    type: input.type ?? "x402",
    app: "bookanai",
    ...(input.ledgerEntryId ? { ledger: input.ledgerEntryId } : {}),
    ...(input.agentId ? { agent: input.agentId } : {}),
    ...(input.settlementId ? { settle: input.settlementId } : {}),
    ...(input.batchId ? { batch: input.batchId } : {}),
  };
}

export function encodeArcMemoBytes(memo: ArcNanopaymentMemo): `0x${string}` {
  return toHex(JSON.stringify(memo));
}

export function encodeSendWithMemoCalldata(input: {
  destinationAddress: `0x${string}`;
  amountUsdc: number;
  memo: ArcNanopaymentMemo;
}): `0x${string}` {
  return encodeFunctionData({
    abi: ARC_MEMO_ABI,
    functionName: "sendWithMemo",
    args: [
      input.destinationAddress,
      usdcToErc20Atomic(input.amountUsdc),
      encodeArcMemoBytes(input.memo),
    ],
  });
}

export function encodeArcBatchAggregate3ValueCalldata(
  items: ArcBatchTransferItem[],
): { callData: `0x${string}`; totalNativeWei: bigint } {
  const calls = items.map((item) => ({
    target: ARC_MEMO_CONTRACT_ADDRESS,
    allowFailure: false,
    value: usdcToNativeWei(item.amountUsdc),
    callData: encodeSendWithMemoCalldata({
      destinationAddress: item.destinationAddress,
      amountUsdc: item.amountUsdc,
      memo: item.memo,
    }),
  }));

  const totalNativeWei = calls.reduce((sum, c) => sum + c.value, 0n);

  return {
    callData: encodeFunctionData({
      abi: ARC_MULTICALL3_FROM_ABI,
      functionName: "aggregate3Value",
      args: [calls],
    }),
    totalNativeWei,
  };
}

export function arcExtensionsActive(chainId: SupportedChainId): boolean {
  return isArcChain(chainId);
}
