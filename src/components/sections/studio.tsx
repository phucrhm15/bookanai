import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/tanstack-react-start";
import { toast } from "sonner";
import { ArrowUpRight, Loader2, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ARC_MAINNET_CHAIN_ID } from "@/lib/chains";
import { postNanopayment, type NanopaymentApiResponse } from "@/lib/wallet-api";
import { useWallet, walletQueryKey } from "@/hooks/use-wallet";
import { useTranslation } from "@/lib/i18n/locale-context";

type ResearchResult = {
  query?: string;
  summary?: string;
  citations?: Array<{ title?: string; url?: string }>;
  sources_used?: number;
  model?: string;
};

function readResult(response: NanopaymentApiResponse): ResearchResult {
  const value: unknown = JSON.parse(response.rawResponse);
  if (!value || typeof value !== "object") throw new Error("The research API returned an invalid response.");
  return value as ResearchResult;
}

export function Studio() {
  const { userId } = useAuth();
  const { data: wallet } = useWallet();
  const queryClient = useQueryClient();
  const { locale } = useTranslation();
  const vi = locale === "vi";
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ data: ResearchResult; payment: NanopaymentApiResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const runResearch = async () => {
    if (inFlight.current) return;
    if (!prompt.trim()) {
      setError(vi ? "Hãy nhập câu hỏi nghiên cứu." : "Enter a research question first.");
      return;
    }
    if (!wallet?.walletId) {
      setError(vi ? "Ví Circle chưa sẵn sàng. Hãy đăng nhập và mở Wallet." : "Your Circle wallet is not ready. Sign in and open Wallet first.");
      return;
    }

    inFlight.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const payment = await postNanopayment(
        wallet.walletId,
        "arc-research",
        ARC_MAINNET_CHAIN_ID,
        prompt.trim(),
        idempotencyKey,
      );
      const data = readResult(payment);
      setResult({ data, payment });
      await queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
      toast.success(vi ? "Nghiên cứu hoàn tất" : "Research complete", {
        description: `${payment.chargedUsdc.toFixed(6)} USDC · Arc Mainnet`,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      toast.error(vi ? "Không thể hoàn tất nghiên cứu" : "Research could not be completed", { description: message });
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <header className="mb-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
          <span className="h-2 w-2 rounded-full bg-success" /> Arc Mainnet · x402
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-5xl">
          {vi ? "Arc Research" : "Arc Research"} <span className="text-gradient-neon">Studio</span>
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
          {vi
            ? "Đặt câu hỏi về crypto hoặc Arc. Dịch vụ tìm kiếm AI của BlockRun lấy thông tin mới từ web và tin tức, trả bản tóm tắt kèm nguồn. App chỉ thanh toán khi API báo giá x402 trên Arc Mainnet."
            : "Ask about crypto or Arc. BlockRun’s AI search retrieves current web and news information and returns a sourced summary. The app pays only when the API quotes a valid x402 price on Arc Mainnet."}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
        <section className="rounded-2xl border border-border/60 bg-gradient-panel p-5 md:p-7">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">{vi ? "Câu hỏi nghiên cứu" : "Research question"}</h2>
              <p className="text-xs text-muted-foreground">BlockRun · Circle Agent Marketplace</p>
            </div>
          </div>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={7}
            maxLength={1000}
            disabled={loading}
            placeholder={vi ? "Ví dụ: Những tin tức nào đang ảnh hưởng đến hệ sinh thái Arc?" : "Example: What recent developments are affecting the Arc ecosystem?"}
            className="resize-y border-border/60 bg-background/60 font-mono text-sm"
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-5 text-muted-foreground">
              <span className="font-mono text-success">● ARC MAINNET</span>
              <span className="mx-2">·</span>
              {vi ? "Giá lấy trực tiếp từ báo giá 402; số tiền có thể thay đổi theo yêu cầu." : "Price comes from the live 402 quote and may vary by request."}
            </div>
            <Button onClick={runResearch} disabled={loading || !wallet?.walletId} className="bg-gradient-neon text-neon-foreground shadow-neon hover:opacity-90">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {loading ? (vi ? "Đang tìm và thanh toán…" : "Searching and paying…") : (vi ? "Nghiên cứu · trả bằng USDC" : "Research · pay with USDC")}
            </Button>
          </div>
          {error ? <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        </section>

        <section className="min-h-72 rounded-2xl border border-border/60 bg-card/70 p-5 md:p-7">
          <div className="mb-5 flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{vi ? "Báo cáo và nguồn" : "Research and sources"}</span>
          </div>
          {!result && !loading ? (
            <p className="text-sm leading-6 text-muted-foreground">{vi ? "Kết quả nghiên cứu sẽ xuất hiện ở đây sau khi thanh toán x402 được chấp nhận." : "Your research will appear here after the x402 payment is accepted."}</p>
          ) : null}
          {loading ? <p className="text-sm text-muted-foreground">{vi ? "Đang hỏi giá Arc, thanh toán và chờ API trả kết quả…" : "Checking the Arc quote, paying, and waiting for the API response…"}</p> : null}
          {result ? (
            <div className="space-y-5">
              <div className="whitespace-pre-wrap text-sm leading-7">{result.data.summary || result.payment.generatedContent || result.payment.rawResponse}</div>
              {result.data.citations?.length ? (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{vi ? "Nguồn tham khảo" : "Sources"}</h3>
                  <ul className="space-y-2">
                    {result.data.citations.map((citation, index) => (
                      <li key={`${citation.url}-${index}`}>
                        <a href={citation.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
                          {citation.title || citation.url}<ArrowUpRight className="h-3 w-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="border-t border-border/60 pt-3 text-xs leading-5 text-muted-foreground">
                <p>{vi ? "Đã thanh toán" : "Charged"}: <span className="font-mono text-foreground">{result.payment.chargedUsdc.toFixed(6)} USDC</span> · Arc Mainnet</p>
                {result.payment.providerPaymentTxHash ? (
                  <a className="mt-1 inline-block text-primary underline-offset-4 hover:underline" href={`https://explorer.arc.io/tx/${result.payment.providerPaymentTxHash}`} target="_blank" rel="noreferrer">
                    {vi ? "Xem giao dịch thanh toán API" : "View API payment transaction"} <ArrowUpRight className="inline h-3 w-3" />
                  </a>
                ) : <p>{vi ? "API chưa trả mã giao dịch để hiển thị." : "The API did not return a transaction hash."}</p>}
                {result.data.model ? <p>{vi ? "AI tìm kiếm" : "AI search"}: {result.data.model}</p> : null}
              </div>
            </div>
          ) : null}
        </section>
      </div>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">
        {vi
          ? "Lưu ý: payment x402 của nhà cung cấp và khoản trừ số dư trong app là hai bước riêng. Trang kết quả hiển thị mã giao dịch của API khi nhà cung cấp gửi về; nếu không có mã, không được xem đó là bằng chứng thanh toán on-chain."
          : "Note: the provider’s x402 payment and the app’s balance debit are separate steps. The result shows the provider transaction hash when supplied; without one, it is not proof of an on-chain payment."}
      </p>
    </main>
  );
}
