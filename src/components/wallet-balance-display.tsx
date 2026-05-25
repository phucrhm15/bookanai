import { useWallet } from "@/hooks/use-wallet";
import { useTranslation } from "@/lib/i18n/locale-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet } from "lucide-react";

type WalletBalanceDisplayProps = {
  variant?: "header" | "sidebar";
};

/** Real USDC balance from GET /api/wallet (Clerk session). */
export function WalletBalanceDisplay({ variant = "header" }: WalletBalanceDisplayProps) {
  const { t } = useTranslation();
  const { data: wallet, isLoading, isError } = useWallet();
  const balance = wallet?.ledgerBalance ?? wallet?.unifiedBalance?.totalUsdc ?? 0;

  if (variant === "sidebar") {
    return (
      <div className="px-2 py-2 group-data-[collapsible=icon]:hidden">
        <div className="flex items-center gap-2 text-xs">
          <Wallet className="h-3.5 w-3.5 text-primary shrink-0" />
          {isLoading ? (
            <Skeleton className="h-4 w-16" />
          ) : isError ? (
            <span className="text-muted-foreground">{t("auth.balanceUnavailable")}</span>
          ) : (
            <span className="font-mono font-semibold text-foreground">
              {(balance ?? 0).toFixed(2)} USDC
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs shadow-neon">
      <Wallet className="h-3.5 w-3.5 text-primary shrink-0" />
      {isLoading ? (
        <Skeleton className="h-4 w-16" />
      ) : isError ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="font-mono font-semibold">{(balance ?? 0).toFixed(2)} USDC</span>
      )}
    </div>
  );
}
