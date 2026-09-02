import { createHash, timingSafeEqual } from "node:crypto";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyRazorpaySignature(rawBody: string, signature: string | undefined, secret: string | undefined) {
  if (!signature || !secret) return false;
  const expected = createHash("sha256").update(`${rawBody}`).digest("hex");
  const provided = Buffer.from(signature);
  const actual = Buffer.from(expected);
  return provided.length === actual.length && timingSafeEqual(provided, actual);
}