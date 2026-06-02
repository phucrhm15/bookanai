/**
 * Protects operator-only routes (cron, master status, x402 debug).
 * Production requires SETTLEMENT_CRON_SECRET (≥16 chars).
 */
export function isAuthorizedAdminRequest(request: Request): boolean {
  const secret = process.env.SETTLEMENT_CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const cronHeader = request.headers.get("x-cron-secret");
  return bearer === secret || cronHeader === secret;
}
