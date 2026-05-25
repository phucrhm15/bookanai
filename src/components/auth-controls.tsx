import { Link } from "@tanstack/react-router";
import { useAuth, UserButton } from "@clerk/tanstack-react-start";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { useTranslation } from "@/lib/i18n/locale-context";

type AuthControlsProps = {
  variant?: "header" | "sidebar";
};

export function AuthControls({ variant = "header" }: AuthControlsProps) {
  const { t } = useTranslation();
  const { isLoaded, isSignedIn } = useAuth();
  const compact = variant === "header";

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return (
      <div
        className={
          compact
            ? "flex items-center gap-2"
            : "flex flex-col gap-2 px-2 py-2"
        }
      >
        <Button variant={compact ? "outline" : "default"} size="sm" className="gap-1.5" asChild>
          <Link to="/sign-in">
            <LogIn className="h-4 w-4" />
            {t("auth.signIn")}
          </Link>
        </Button>
        <Button
          size="sm"
          className={compact ? "gap-1.5 bg-gradient-neon text-neon-foreground" : "w-full gap-2"}
          asChild
        >
          <Link to="/sign-up">
            <UserPlus className="h-4 w-4" />
            {t("auth.signUp")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? "flex items-center gap-2"
          : "flex items-center justify-between gap-2 px-2 py-2"
      }
    >
      <UserButton appearance={clerkAppearance} afterSignOutUrl="/sign-in" />
      {!compact && (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("auth.account")}
        </span>
      )}
    </div>
  );
}

export function AuthSidebarHint() {
  const { t } = useTranslation();
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || isSignedIn) return null;

  return (
    <p className="px-2 text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
      {t("auth.sidebarHint")}
    </p>
  );
}
