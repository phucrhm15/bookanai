import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/locale-context";
import type { Locale } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  variant?: "header" | "compact";
  className?: string;
};

export function LanguageSwitcher({ variant = "header", className }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useTranslation();
  const next: Locale = locale === "en" ? "vi" : "en";
  const label = locale === "en" ? t("lang.switchToVi") : t("lang.switchToEn");

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "gap-1.5 font-mono text-[10px] uppercase tracking-wider",
        variant === "compact" && "h-7 px-2",
        className,
      )}
      onClick={() => setLocale(next)}
      title={t("lang.label")}
      aria-label={`${t("lang.label")}: ${label}`}
    >
      <Languages className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
    </Button>
  );
}
