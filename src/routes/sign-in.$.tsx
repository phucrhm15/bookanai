import { createFileRoute } from "@tanstack/react-router";
import { SignIn } from "@clerk/tanstack-react-start";
import { redirectIfAuthenticated } from "@/lib/auth-server";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslation } from "@/lib/i18n/locale-context";

export const Route = createFileRoute("/sign-in/$")({
  beforeLoad: () => redirectIfAuthenticated(),
  component: SignInPage,
});

function SignInPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center grid-bg px-4 py-12">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher variant="compact" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            NANO<span className="text-gradient-neon">.AGENT</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.signInSubtitle")}</p>
        </div>
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}
