import { Link } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-react-start";
import { ArrowRight, Sparkles, Wallet, Zap, Layers, Search } from "lucide-react";
import { useTranslation } from "@/lib/i18n/locale-context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuthControls } from "@/components/auth-controls";

export function Landing() {
  const { isLoaded, isSignedIn } = useAuth();
  const { t, locale } = useTranslation();
  const vi = locale === "vi";

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
                BOOK<span className="text-gradient-neon">ANAI</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                x402 · Arc Mainnet
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
                <Link to="/studio">
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
                  <Link to="/studio">{vi ? "Mở Arc Research" : "Open Arc Research"}</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/wallet">{t("landing.ctaTopUp")}</Link>
                </Button>
              </>
            ) : null}
          </div>
        </section>

        <section className="border-y border-border/60 bg-card/30 py-16">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-2 lg:grid-cols-4 md:px-6">
            <Feature
              icon={Sparkles}
              title={vi ? "Nghiên cứu bằng AI" : "AI-powered research"}
              text={vi ? "Tìm tin web và tin tức mới, trả về tóm tắt có nguồn." : "Search current web and news, then return a sourced summary."}
            />
            <Feature
              icon={Wallet}
              title={vi ? "Thanh toán theo lượt" : "Pay per request"}
              text={vi ? "Giá lấy từ báo giá x402 thật trước khi thanh toán." : "The app reads the provider’s live x402 quote before payment."}
            />
            <Feature
              icon={Layers}
              title="Arc Mainnet"
              text={vi ? "USDC được thanh toán trực tiếp trên Arc Mainnet." : "USDC payment settles on Arc Mainnet."}
              highlight
            />
            <Feature
              icon={Search}
              title={vi ? "Nguồn minh bạch" : "Sources included"}
              text={vi ? "Mở nguồn tham khảo và mã giao dịch ngay trong kết quả." : "Open source links and the provider transaction receipt from the result."}
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <h2 className="font-display text-2xl font-bold">Arc Research Studio</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {vi
              ? "Một studio duy nhất gọi API nghiên cứu AI được liệt kê trên Circle Agent Marketplace. Phí thay đổi theo báo giá x402 của nhà cung cấp."
              : "One focused studio calling an AI research API listed on Circle Agent Marketplace. The provider’s x402 quote determines the charge."}
          </p>
          <div className="mt-8 rounded-xl border border-yellow-400/30 bg-gradient-panel p-5">
            <div className="flex items-start gap-3">
              <span className="text-3xl">🔎</span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">BlockRun AI Search</h3>
                  <Badge variant="outline" className="shrink-0 border-yellow-400/40 bg-yellow-400/10 font-mono text-[9px] uppercase tracking-wider text-yellow-300">
                    Arc Mainnet
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {vi
                    ? "Tìm kiếm web và tin tức bằng AI, tạo tóm tắt kèm liên kết nguồn. Thanh toán x402 bằng USDC trên Arc."
                    : "AI search across web and news, with a sourced summary. Paid through x402 in USDC on Arc."}
                </p>
                <p className="mt-3 font-mono text-xs text-primary">
                  {vi ? "Phí hiển thị trước khi thanh toán theo báo giá trực tiếp" : "Live price shown from the quote before payment"}
                </p>
              </div>
            </div>
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
  highlight,
}: {
  icon: typeof Sparkles;
  title: string;
  text: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-xl border border-yellow-400/40 bg-yellow-400/5 p-5 shadow-[0_0_18px_rgba(251,191,36,0.08)]"
          : "rounded-xl border border-border/60 bg-background/60 p-5"
      }
    >
      <Icon className={`mb-3 h-8 w-8 ${highlight ? "text-yellow-400" : "text-primary"}`} />
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
