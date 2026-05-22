export type ChainBalanceBreakdown = {
  chain: string;
  chainId: number;
  confirmedBalance: string;
};

export type UnifiedBalanceSnapshot = {
  totalUsdc: number;
  totalConfirmedBalance: string;
  breakdown: ChainBalanceBreakdown[];
};
