import { createFileRoute } from "@tanstack/react-router";
import { SignUp } from "@clerk/tanstack-react-start";
import { redirectIfAuthenticated } from "@/lib/auth-server";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslation } from "@/lib/i18n/locale-context";

export const Route = createFileRoute("/sign-up/$")({
  beforeLoad: () => redirectIfAuthenticated(),
  component: SignUpPage,
});

function SignUpPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center grid-bg px-4 py-12">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher variant="compact" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {t("auth.signUpTitle")}{" "}
            <span className="text-gradient-neon">{t("auth.signUpTitleAccent")}</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.signUpSubtitle")}</p>
        </div>
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}
