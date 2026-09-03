import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay signs the raw request body with HMAC-SHA256 using the webhook secret.
 * Reference: https://razorpay.com/docs/webhooks/validate-test/
 *
 * The comparison must use timingSafeEqual to prevent timing attacks.
 */
export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!signature || !secret) return false;
  // HMAC-SHA256 of the raw body using the webhook secret
  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "utf8");
  const providedBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
