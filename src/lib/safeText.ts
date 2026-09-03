/**
 * Operator-safe text.
 *
 * The backend, in a few places, stringifies a caught error (`String(err)`) into
 * a response body or an audit row. Those strings can carry transport codes,
 * driver names, file paths or credentials, none of which belong on screen. This
 * module is the single gate every such string passes through before it is
 * rendered: a message either reads like a sentence written for an operator, or
 * it is replaced by a curated line.
 *
 * This is presentational only. Nothing here alters what the backend recorded —
 * the full text remains in the server logs, where it is useful.
 */

/**
 * Markers of a message written for a log file rather than a person: stack
 * frames, transport codes, driver names, file paths, serialised objects, and
 * anything shaped like a credential.
 */
const TECHNICAL: RegExp[] = [
  /\bat\s+[\w$.<>[\]]+\s*\(/, // stack frame
  /\b(?:Error|Exception|TypeError|ReferenceError)\b\s*:/i,
  /\b(?:ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|EAUTH|EPIPE|ENOENT|EAI_AGAIN)\b/,
  /\b\d{3}\s\d\.\d\.\d\b/, // SMTP enhanced status code, e.g. 535 5.7.8
  /\b(?:prisma|postgres|postgresql|sqlstate|nodemailer|axios|undici|fetch failed)\b/i,
  /\b(?:node_modules|\/src\/|\.[jt]s:\d+|[A-Za-z]:\\)/, // paths and line references
  /\b(?:localhost|127\.0\.0\.1):\d+/,
  /\b(?:rzp_(?:test|live)_|key_|sk_|Bearer\s)/i,
  /\bcannot read propert/i,
  /\bundefined is not\b/i,
];

/**
 * True when a string reads like an operator-facing sentence: one line, a
 * sensible length, opening on a letter, and free of every technical marker
 * above.
 */
export function isOperatorText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 240) return false;
  if (/[\r\n\t]/.test(trimmed)) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("<")) return false;
  if (!/^[A-Za-z₹]/.test(trimmed)) return false;
  if (!trimmed.includes(" ")) return false;
  return !TECHNICAL.some((pattern) => pattern.test(trimmed));
}

/** The string itself when it is safe to show, otherwise the fallback. */
export function operatorText(value: unknown, fallback: string): string {
  return isOperatorText(value) ? value.trim() : fallback;
}

/**
 * What to tell an operator when a delivery attempt failed and the recorded
 * reason is not fit to show. Named by channel, because the useful next step
 * differs: a WhatsApp failure is usually the number, an email failure is
 * usually the address or the mailbox.
 */
export function deliveryFailureText(
  recorded: unknown,
  channel: string | null | undefined,
): string {
  if (isOperatorText(recorded)) return recorded.trim();
  switch ((channel ?? "").toUpperCase()) {
    case "WHATSAPP":
      return "WhatsApp did not accept the message. The number may not be reachable on WhatsApp. The full response is in the server log.";
    case "EMAIL":
      return "The mail server rejected the message. The address may not accept mail. The full response is in the server log.";
    case "SMS":
      return "The SMS gateway did not accept the message. The full response is in the server log.";
    default:
      return "The provider rejected this attempt. The full response is in the server log.";
  }
}
