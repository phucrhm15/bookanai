import { AuthControls } from "@/components/auth-controls";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslation } from "@/lib/i18n/locale-context";
import { WalletBalanceDisplay } from "@/components/wallet-balance-display";
import { Zap } from "lucide-react";

export function TopBar() {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs md:flex">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">{t("nav.activeAgent")}</span>
          <span className="font-medium text-foreground">Arc Research</span>
          <span className="rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-300">
            Arc Mainnet
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher variant="compact" />
        <WalletBalanceDisplay variant="header" />
        <AuthControls variant="header" />
      </div>
    </header>
  );
}
