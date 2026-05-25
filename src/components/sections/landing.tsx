import { Link } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-react-start";
import { ArrowRight, Sparkles, Store, Wallet, Zap } from "lucide-react";
import { getLocalizedAgents } from "@/lib/agents-localized";
import { useTranslation } from "@/lib/i18n/locale-context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuthControls } from "@/components/auth-controls";

export function Landing() {
  const { isLoaded, isSignedIn } = useAuth();
  const { t, locale } = useTranslation();
  const agents = getLocalizedAgents(locale);

  return (
    <div className="min-h-screen grid-bg text-foreground">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-neon font-display text-lg font-bold text-neon-foreground shadow-neon">
              N
            </div>
            <div>
              <div className="font-display text-sm font-bold tracking-wide">
                NANO<span className="text-gradient-neon">.AGENT</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                x402 · USDC on Base
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="compact" />
            <AuthControls variant="header" />
            {isLoaded && !isSignedIn ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link to="/sign-in">{t("landing.signIn")}</Link>
                </Button>
                <Button asChild size="sm" className="bg-gradient-neon text-neon-foreground shadow-neon">
                  <Link to="/sign-up">{t("landing.signUpFree")}</Link>
                </Button>
              </>
            ) : null}
            {isLoaded && isSignedIn ? (
              <Button asChild size="sm" className="bg-gradient-neon text-neon-foreground shadow-neon">
                <Link to="/marketplace">
                  {t("landing.ctaOpenApp")}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <Badge
            variant="outline"
            className="mb-4 border-primary/40 bg-primary/10 font-mono text-[10px] uppercase tracking-[0.2em] text-primary"
          >
            {t("landing.badge")}
          </Badge>
          <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl">
            {t("landing.heroTitle")}{" "}
            <span className="text-gradient-neon">{t("landing.heroTitleAccent")}</span>
            {t("landing.heroTitleSuffix")}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">{t("landing.heroBody")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {isLoaded && !isSignedIn ? (
              <>
                <Button asChild size="lg" className="bg-gradient-neon text-neon-foreground shadow-neon">
                  <Link to="/sign-up">
                    {t("landing.ctaSignUp")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/sign-in">{t("landing.ctaHasAccount")}</Link>
                </Button>
              </>
            ) : null}
            {isLoaded && isSignedIn ? (
              <>
                <Button asChild size="lg" className="bg-gradient-neon text-neon-foreground shadow-neon">
                  <Link to="/marketplace">{t("landing.ctaMarketplace")}</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/wallet">{t("landing.ctaTopUp")}</Link>
                </Button>
              </>
            ) : null}
          </div>
        </section>

        <section className="border-y border-border/60 bg-card/30 py-16">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-3 md:px-6">
            <Feature
              icon={Store}
              title={t("landing.featureMarketplaceTitle")}
              text={t("landing.featureMarketplaceText")}
            />
            <Feature
              icon={Sparkles}
              title={t("landing.featureStudioTitle")}
              text={t("landing.featureStudioText")}
            />
            <Feature
              icon={Wallet}
              title={t("landing.featureWalletTitle")}
              text={t("landing.featureWalletText")}
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <h2 className="font-display text-2xl font-bold">{t("landing.agentsTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("landing.agentsHint")}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {agents.map((agent) => (
              <article
                key={agent.id}
                className="rounded-xl border border-border/60 bg-gradient-panel p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{agent.emoji}</span>
                  <div>
                    <h3 className="font-semibold">{agent.name}</h3>
                    <p className="font-mono text-[10px] uppercase text-muted-foreground">
                      {agent.handle}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{agent.description}</p>
                    <p className="mt-3 font-mono text-xs text-primary">
                      ~{agent.price} {t("landing.perRequest")}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-10 text-center">
            {isLoaded && !isSignedIn ? (
              <Button asChild className="bg-gradient-neon text-neon-foreground">
                <Link to="/sign-up">
                  <Zap className="mr-2 h-4 w-4" />
                  {t("landing.ctaTry")}
                </Link>
              </Button>
            ) : null}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        {t("landing.footer")}
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Store;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-5">
      <Icon className="mb-3 h-8 w-8 text-primary" />
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
