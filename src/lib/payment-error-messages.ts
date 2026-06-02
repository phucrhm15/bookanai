import type { Locale } from "@/lib/i18n/types";
import { DEFAULT_LOCALE } from "@/lib/i18n/types";

const MASTER_USDC_RE =
  /Ví Master thiếu USDC|Circle Gateway thiếu USDC|Gateway thiếu USDC|Master wallet|Circle Gateway/i;
const USER_USDC_RE =
  /Số dư không đủ|INSUFFICIENT_BALANCE|Insufficient USDC|khả dụng|Insufficient balance|Content Credits/i;
const GAS_RE =
  /native token|insufficient funds for gas|max fee per gas|gas required exceeds|ETH gas/i;
const NETWORK_SCHEME_RE =
  /No network\/scheme registered|x402Version|paymentRequirements|eip155:137|GatewayWalletBatched/i;
const PAYMENT_VERIFY_RE =
  /Payment verification failed|payment verification failed|x402 verify failed/i;
const AISA_API_KEY_RE = /invalid api key/i;
const MESSARI_WALLET_USDC_RE =
  /thiếu USDC on-chain trên Base|USDC on-chain on Base/i;
const RPC_AUTH_RE =
  /polygon-rpc\.com|API key disabled|tenant disabled|json-rpc code: -32051/i;
const MARKET_TIMEOUT_RE =
  /AI Agent Marketplace did not respond within|did not respond within \d+ms|TIMEOUT/i;
const POLYGON_CONTEXT_RE = /polygon|eip155:137|surf|nano\.blockrun/i;

function spendableLooksZero(message: string): boolean {
  const m = message.match(/khả dụng ([\d.]+)|available ([\d.]+)/i);
  return m ? Number(m[1]) < 0.000_001 : false;
}

function extractAddress(message: string): string | undefined {
  const match = message.match(/0x[a-fA-F0-9]{40}/);
  return match?.[0];
}

/**
 * Rewrite server/CLI errors for end users (locale-aware).
 */
export function formatPaymentErrorForUser(
  rawMessage: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const message = rawMessage.trim();
  if (!message) {
    return locale === "vi"
      ? "Thanh toán thất bại. Thử lại sau."
      : "Payment failed. Please try again.";
  }

  if (MASTER_USDC_RE.test(message)) {
    const addr = extractAddress(message);
    const needsPolygon = POLYGON_CONTEXT_RE.test(message);
    if (locale === "vi") {
      return (
        `Hệ thống chưa đủ USDC để trả API cho agent (ví x402 của server, không phải ví Content Credits của bạn). ` +
        (addr
          ? needsPolygon
            ? `Admin nạp USDC + MATIC trên Polygon vào ${addr}, rồi chạy: npm run gateway:deposit -- 0.05 polygon`
            : `Admin nạp thêm USDC (Base) vào ${addr} hoặc chạy: npm run gateway:deposit -- 0.15`
          : needsPolygon
            ? "Admin chạy: npm run show:x402 rồi nạp USDC + MATIC trên Polygon, sau đó: npm run gateway:deposit -- 0.05 polygon"
            : "Admin chạy: npm run show:x402 rồi npm run gateway:deposit -- 0.15")
      );
    }
    return (
      "The server does not have enough USDC to pay the agent API (x402 master wallet, not your Content Credits). " +
      (addr
        ? needsPolygon
          ? `Admin: fund ${addr} with USDC + MATIC on Polygon, then run: npm run gateway:deposit -- 0.05 polygon`
          : `Admin: deposit USDC on Base to ${addr} or run: npm run gateway:deposit -- 0.15`
        : needsPolygon
          ? "Admin: npm run show:x402, fund USDC + MATIC on Polygon, then run: npm run gateway:deposit -- 0.05 polygon"
          : "Admin: npm run show:x402 then npm run gateway:deposit -- 0.15")
    );
  }

  if (GAS_RE.test(message)) {
    const addr = extractAddress(message);
    if (locale === "vi") {
      return (
        "Thiếu ETH gas trên Base cho ví x402 của server (MASTER_AGENT_PRIVATE_KEY), " +
        "không phải ví bạn dùng để nạp Content Credits. " +
        (addr
          ? `Admin nạp ~0.001–0.002 ETH (Base) vào ${addr} · npm run show:x402`
          : "Admin: npm run show:x402 — nạp ETH Base vào địa chỉ in ra.")
      );
    }
    return (
      "Insufficient ETH gas on Base for the server x402 wallet (MASTER_AGENT_PRIVATE_KEY), " +
      "not your Content Credits wallet. " +
      (addr
        ? `Admin: send ~0.001–0.002 ETH (Base) to ${addr} · npm run show:x402`
        : "Admin: npm run show:x402 — fund ETH on the printed address.")
    );
  }

  if (RPC_AUTH_RE.test(message)) {
    if (locale === "vi") {
      return (
        "RPC Polygon trên server bị từ chối (polygon-rpc.com cần API key). " +
        "Admin: đặt POLYGON_RPC_URL=https://polygon.llamarpc.com trên Render, redeploy, " +
        "và đảm bảo ví master có USDC trong Circle Gateway Polygon + MATIC gas."
      );
    }
    return (
      "Polygon RPC on the server was rejected (polygon-rpc.com requires an API key). " +
      "Admin: set POLYGON_RPC_URL=https://polygon.llamarpc.com on Render, redeploy, " +
      "and ensure the master wallet has Gateway USDC on Polygon plus MATIC for gas."
    );
  }

  if (MARKET_TIMEOUT_RE.test(message)) {
    return locale === "vi"
      ? "Marketplace phản hồi chậm hơn dự kiến. Thử lại sau 5-10 giây. Nếu lỗi lặp lại, dùng Surf trước hoặc thử prompt ngắn hơn."
      : "Marketplace responded slower than expected. Retry in 5-10 seconds. If it keeps happening, use Surf first or try a shorter prompt.";
  }

  if (MESSARI_WALLET_USDC_RE.test(message)) {
    if (locale === "vi") {
      return (
        "Messari dùng x402 exact trên Base — cần USDC trong ví master on-chain (~0.1 USDC/lần), " +
        "không chỉ trong Circle Gateway. Admin: npm run show:x402 → nạp USDC (Base) vào địa chỉ in ra."
      );
    }
    return (
      "Messari uses exact x402 on Base — the master wallet needs on-chain USDC (~0.1 USDC/call), " +
      "not only Circle Gateway balance. Admin: npm run show:x402 → fund USDC on Base at the printed address."
    );
  }

  if (AISA_API_KEY_RE.test(message)) {
    if (locale === "vi") {
      return (
        "API AIsa (Perplexity) từ chối yêu cầu — marketplace có thể đang lỗi (endpoint không trả HTTP 402 đúng chuẩn x402). " +
        "Thử agent Surf (đã hoạt động khi Gateway Polygon đủ USDC) hoặc liên hệ Circle/AIsa. Gateway Base admin: npm run gateway:status."
      );
    }
    return (
      "AIsa (Perplexity) rejected the request — the marketplace endpoint may be misconfigured (no proper HTTP 402). " +
      "Try Surf (works when Polygon Gateway is funded) or contact Circle/AIsa. Admin: npm run gateway:status for Base Gateway."
    );
  }

  if (PAYMENT_VERIFY_RE.test(message)) {
    if (locale === "vi") {
      return (
        "Thanh toán x402 không được Surf xác minh. Surf dùng Circle Gateway trên Polygon — " +
        "ví master (MASTER_AGENT_PRIVATE_KEY) cần USDC trong Gateway Polygon và MATIC gas. " +
        "Chạy npm run show:x402 để xem địa chỉ master."
      );
    }
    return (
      "x402 payment was not verified by Surf. Surf uses Circle Gateway on Polygon — " +
      "the master wallet (MASTER_AGENT_PRIVATE_KEY) needs Gateway USDC on Polygon plus MATIC for gas. " +
      "Run npm run show:x402 for the master address."
    );
  }

  if (NETWORK_SCHEME_RE.test(message)) {
    if (locale === "vi") {
      return (
        "Agent này hiện yêu cầu mạng thanh toán khác (thấy eip155:137 = Polygon), " +
        "trong khi hệ thống đang settle x402 trên Base (8453). " +
        "Đã bật auto-route cho Base/Polygon, nhưng ví master cần có USDC (và gas) trên mạng mà agent yêu cầu."
      );
    }
    return (
      "This agent currently requires a different payment network (detected eip155:137 = Polygon), " +
      "while the app settles x402 on Base (8453). " +
      "Auto-routing is enabled for Base/Polygon, but the master wallet must have USDC (and gas) on the required network."
    );
  }

  if (USER_USDC_RE.test(message) && !MASTER_USDC_RE.test(message)) {
    const holdMatch = message.match(/đang giữ chuyển ([\d.]+)|hold ([\d.]+)/i);
    const ledgerMatch = message.match(/ledger ([\d.]+)/i);
    const onChainMatch = message.match(/ví on-chain ([\d.]+)|on-chain ([\d.]+)/i);
    const hold = holdMatch ? Number(holdMatch[1] ?? holdMatch[2]) : 0;
    const ledger = ledgerMatch ? Number(ledgerMatch[1]) : 0;
    const onChain = onChainMatch ? Number(onChainMatch[1] ?? onChainMatch[2]) : 0;
    const requiredMatch = message.match(/Cần ([\d.]+)|Required[:\s]+([\d.]+)/i);
    const required = requiredMatch
      ? Number(requiredMatch[1] ?? requiredMatch[2])
      : 0;
    const availMatch = message.match(/khả dụng ([\d.]+)|available ([\d.]+)/i);
    const available = availMatch ? Number(availMatch[1] ?? availMatch[2]) : 0;

    if (locale === "vi") {
      let hint =
        "Mở Wallet & Billing → Top Up (USDC trên Base). Không cần ETH cho ví của bạn.";
      if (onChain > 0 && ledger < 0.01 && hold < 0.000_001) {
        hint = "Ví on-chain có USDC nhưng Content Credits chưa đồng bộ — refresh trang Wallet rồi thử lại.";
      } else if (hold > 0.001 && spendableLooksZero(message)) {
        hint =
          "Một phần số dư đang chờ chuyển on-chain (hoặc treo sau lỗi). Đợi 1–2 phút, refresh Wallet, thử lại.";
      } else if (hold > 0.001 && onChain > ledger && required > available) {
        const topUp = Math.max(0.01, required - available);
        hint =
          `~${hold.toFixed(3)} USDC đang chờ settle sau các lần chạy agent trước (ví on-chain ${onChain.toFixed(3)} USDC, credits khả dụng ${available.toFixed(3)}). ` +
          `Nạp thêm ~${topUp.toFixed(2)} USDC (Base) hoặc chọn agent rẻ hơn (Surf ~0.001 USDC). Mở Wallet để xử lý settle.`;
      }
      return `Số dư Content Credits không đủ cho lần gọi này. ${hint}`;
    }

    let hint = "Open Wallet & Billing → Top Up (USDC on Base). You do not need ETH in your wallet.";
    if (onChain > 0 && ledger < 0.01 && hold < 0.000_001) {
      hint = "On-chain USDC exists but Content Credits are out of sync — refresh Wallet and retry.";
    } else if (hold > 0.001 && spendableLooksZero(message)) {
      hint =
        "Part of your balance is pending on-chain transfer (or stuck after an error). Wait 1–2 minutes, refresh Wallet, retry.";
    } else if (hold > 0.001 && onChain > ledger && required > available) {
      const topUp = Math.max(0.01, required - available);
      hint =
        `~${hold.toFixed(3)} USDC is settling from earlier agent runs (on-chain ${onChain.toFixed(3)} USDC, spendable credits ${available.toFixed(3)}). ` +
        `Top up ~${topUp.toFixed(2)} USDC on Base or pick a cheaper agent (Surf ~0.001 USDC). Open Wallet to process settlement.`;
    }
    return `Insufficient Content Credits for this call. ${hint}`;
  }

  if (message.includes("Gateway batching") || message.includes("No Gateway batching")) {
    return locale === "vi"
      ? "Đang kết nối lại với x402. Thử Run Agent lần nữa."
      : "Reconnecting to x402. Try Run Agent again.";
  }

  return message;
}
