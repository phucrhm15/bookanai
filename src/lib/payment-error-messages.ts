import type { Locale } from "@/lib/i18n/types";
import { DEFAULT_LOCALE } from "@/lib/i18n/types";

/** Keep payment errors truthful: a local ledger debit alone is not an on-chain receipt. */
export function formatPaymentErrorForUser(
  rawMessage: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const message = rawMessage.trim();
  const vi = locale === "vi";

  if (!message) {
    return vi ? "Thanh toán thất bại. Vui lòng thử lại." : "Payment failed. Please try again.";
  }

  if (/Số dư không đủ|INSUFFICIENT_BALANCE|Insufficient (?:USDC|ledger|balance)|Content Credits/i.test(message)) {
    return vi
      ? "Số dư khả dụng không đủ cho báo giá x402 hiện tại. Nạp thêm USDC trên Arc Mainnet rồi thử lại."
      : "Your available balance is below the current x402 quote. Add USDC on Arc Mainnet and retry.";
  }

  if (/HTTP 402|did not return a live HTTP 402|x402 quote/i.test(message)) {
    return vi
      ? "Dịch vụ chưa trả báo giá x402 hợp lệ. App chưa gửi thanh toán; hãy thử lại sau."
      : "The provider did not return a valid x402 quote. No payment was sent; please retry later.";
  }

  if (/timeout|timed out|did not respond within/i.test(message)) {
    return vi
      ? "Dịch vụ nghiên cứu phản hồi quá thời gian. Hãy kiểm tra lịch sử ví trước khi chạy lại để tránh gọi trùng."
      : "The research provider timed out. Check wallet activity before retrying to avoid a duplicate call.";
  }

  if (/gas|insufficient funds/i.test(message) && /Arc|5042|eip155:5042/i.test(message)) {
    return vi
      ? "Ví thanh toán của dịch vụ thiếu USDC trên Arc Mainnet để trả phí giao dịch."
      : "The provider payment wallet lacks USDC on Arc Mainnet for transaction fees.";
  }

  return message;
}
