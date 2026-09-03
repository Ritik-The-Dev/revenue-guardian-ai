/**
 * Presentation vocabulary.
 *
 * Every label the operator reads is defined here, in one place, so the same
 * concept is never called two different things across pages. The language is
 * operational: what the agent observed, decided and executed. No marketing.
 *
 * Nothing in this file invents data. It only formats and labels values that
 * came from the backend.
 */

/** Semantic tone. Maps to the design system's earned-chroma palette. */
export type Tone = "pos" | "warn" | "neg" | "info" | "idle";

// ── Money and numbers ────────────────────────────────────────────────────────

export function formatINR(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Amount without the symbol, for places that render ₹ separately. */
export function formatAmount(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount);
}

/** Indian short scale — ₹4.47L, ₹1.2Cr. Used only where space is tight. */
export function formatINRCompact(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const abs = Math.abs(amount);
  if (abs >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${formatAmount(amount)}`;
}

export function formatPercent(
  value: number | null | undefined,
  digits = 0,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** A 0–1 probability rendered as a percentage. */
export function formatRatio(
  value: number | null | undefined,
  digits = 0,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

// ── Time ─────────────────────────────────────────────────────────────────────

export function formatClock(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatClockSeconds(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatRelative(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1 min ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(d);
}

/** Elapsed duration, e.g. "2m 14s". Used for time-to-recovery. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms) || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// ── Case status ──────────────────────────────────────────────────────────────

interface LabelSpec {
  label: string;
  tone: Tone;
  /** One line the operator can act on. Shown in tooltips and detail headers. */
  hint?: string;
}

const CASE_STATUS: Record<string, LabelSpec> = {
  NEW: { label: "New", tone: "idle", hint: "Received, not yet evaluated." },
  ANALYZING: {
    label: "Analysing",
    tone: "info",
    hint: "The agent is diagnosing the failure and evaluating policy.",
  },
  ACTION_PLANNED: {
    label: "Action planned",
    tone: "info",
    hint: "An action has been approved and is about to execute.",
  },
  ACTION_EXECUTED: {
    label: "Action executed",
    tone: "info",
    hint: "The recovery action ran successfully.",
  },
  WAITING_FOR_OUTCOME: {
    label: "Waiting for outcome",
    tone: "info",
    hint: "The customer has been contacted. Waiting for Razorpay to confirm payment.",
  },
  RETRY_PENDING: {
    label: "Retry pending",
    tone: "warn",
    hint: "A retry is scheduled for later.",
  },
  RECOVERED: {
    label: "Recovered",
    tone: "pos",
    hint: "The payment is recorded as captured. No further outreach will be sent.",
  },
  ESCALATED: {
    label: "Escalated",
    tone: "neg",
    hint: "Automatic recovery is not permitted. A person needs to review this.",
  },
  STOPPED: {
    label: "Stopped",
    tone: "idle",
    hint: "The agent stopped work on this case.",
  },
};

export function caseStatus(status: string | null | undefined): LabelSpec {
  if (!status) return { label: "—", tone: "idle" };
  return CASE_STATUS[status] ?? { label: humanise(status), tone: "idle" };
}

/** Statuses offered as filters, in the order a case moves through them. */
export const CASE_STATUS_ORDER = [
  "ANALYZING",
  "WAITING_FOR_OUTCOME",
  "RETRY_PENDING",
  "RECOVERED",
  "ESCALATED",
  "STOPPED",
] as const;

// ── Diagnosis ────────────────────────────────────────────────────────────────

const DIAGNOSIS: Record<string, LabelSpec> = {
  SOFT_DECLINE: {
    label: "Soft decline",
    tone: "warn",
    hint: "The bank declined the payment, but the same method could still succeed.",
  },
  HARD_DECLINE: {
    label: "Hard decline",
    tone: "neg",
    hint: "The bank refused the payment outright. Retrying will not help.",
  },
  PAYMENT_METHOD_ISSUE: {
    label: "Payment method issue",
    tone: "warn",
    hint: "The stored method cannot complete this payment. It needs updating.",
  },
  TRANSIENT_FAILURE: {
    label: "Transient failure",
    tone: "info",
    hint: "A temporary gateway or network problem. Likely to succeed on retry.",
  },
  CUSTOMER_ACTION_REQUIRED: {
    label: "Customer action required",
    tone: "warn",
    hint: "The customer has to do something before the payment can complete.",
  },
  HIGH_RISK: {
    label: "High risk",
    tone: "neg",
    hint: "Risk signals block automatic recovery on this payment.",
  },
  UNKNOWN: {
    label: "Unknown",
    tone: "idle",
    hint: "The failure could not be classified with confidence.",
  },
};

export function diagnosisLabel(value: string | null | undefined): LabelSpec {
  if (!value) return { label: "—", tone: "idle" };
  return DIAGNOSIS[value] ?? { label: humanise(value), tone: "idle" };
}

export const DIAGNOSIS_ORDER = Object.keys(DIAGNOSIS);

// ── Actions ──────────────────────────────────────────────────────────────────

const ACTION: Record<string, LabelSpec> = {
  SEND_PAYMENT_LINK: { label: "Send payment link", tone: "info" },
  REQUEST_PAYMENT_METHOD_UPDATE: { label: "Request payment method update", tone: "warn" },
  SCHEDULE_RETRY: { label: "Schedule retry", tone: "info" },
  SEND_REMINDER: { label: "Send reminder", tone: "info" },
  ESCALATE: { label: "Escalate to human", tone: "neg" },
  WAIT: { label: "Wait", tone: "idle" },
  STOP: { label: "Stop", tone: "idle" },
};

export function actionLabel(value: string | null | undefined): LabelSpec {
  if (!value) return { label: "—", tone: "idle" };
  return ACTION[value] ?? { label: humanise(value), tone: "idle" };
}

// ── Policy decision ──────────────────────────────────────────────────────────

const POLICY: Record<string, LabelSpec> = {
  ALLOW: { label: "Allowed", tone: "pos" },
  DENY: { label: "Denied", tone: "neg" },
  ESCALATE: { label: "Escalated", tone: "neg" },
  STOP: { label: "Stopped", tone: "idle" },
};

export function policyLabel(value: string | null | undefined): LabelSpec {
  if (!value) return { label: "—", tone: "idle" };
  return POLICY[value] ?? { label: humanise(value), tone: "idle" };
}

// ── Channel ──────────────────────────────────────────────────────────────────

const CHANNEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  SMS: "SMS",
  NONE: "No outreach",
};

export function channelLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return CHANNEL[value] ?? humanise(value);
}

// ── Action execution status ──────────────────────────────────────────────────

const ACTION_STATUS: Record<string, LabelSpec> = {
  PENDING: { label: "Pending", tone: "idle" },
  EXECUTING: { label: "Executing", tone: "info" },
  SENT: { label: "Sent", tone: "pos" },
  SUCCESS: { label: "Delivered", tone: "pos" },
  FAILED: { label: "Failed", tone: "neg" },
  CANCELLED: { label: "Cancelled", tone: "idle" },
};

export function actionStatusLabel(value: string | null | undefined): LabelSpec {
  if (!value) return { label: "—", tone: "idle" };
  return ACTION_STATUS[value] ?? { label: humanise(value), tone: "idle" };
}

// ── Audit events ─────────────────────────────────────────────────────────────
// Every event type the backend actually writes. Anything unrecognised falls
// back to a humanised form rather than being hidden, so the trail stays honest.

const AUDIT_EVENT: Record<string, LabelSpec> = {
  PAYMENT_FAILED: { label: "Payment failed", tone: "neg" },
  CASE_CREATED: { label: "Recovery case opened", tone: "idle" },
  AI_DIAGNOSIS: { label: "AI diagnosis", tone: "info" },
  POLICY_DECISION: { label: "Policy decision", tone: "info" },
  ACTION_APPROVED: { label: "Action approved", tone: "pos" },
  ACTION_DENIED: { label: "Action denied", tone: "neg" },
  ACTION_FAILED: { label: "Action failed", tone: "neg" },
  PAYMENT_LINK_CREATED: { label: "Payment link created", tone: "info" },
  WHATSAPP_SENT: { label: "WhatsApp sent", tone: "pos" },
  EMAIL_SENT: { label: "Email sent", tone: "pos" },
  RETRY_SCHEDULED: { label: "Retry scheduled", tone: "warn" },
  ESCALATED: { label: "Escalated for review", tone: "neg" },
  RECOVERY_STOPPED: { label: "Recovery stopped", tone: "idle" },
  PAYMENT_CAPTURED: { label: "Payment captured", tone: "pos" },
  RECOVERY_COMPLETED: { label: "Recovery completed", tone: "pos" },
  PARTIAL_RECOVERY: { label: "Partial recovery", tone: "warn" },
  RECOVERY_LINK_EXPIRED: { label: "Payment link expired", tone: "warn" },
  RECOVERY_LINK_CANCELLED: { label: "Payment link cancelled", tone: "idle" },
  INVOICE_EXPIRED: { label: "Invoice expired", tone: "warn" },
  TEST_MODE_CONSENT: { label: "Test consent recorded", tone: "idle" },
};

export function auditEventLabel(value: string | null | undefined): LabelSpec {
  if (!value) return { label: "—", tone: "idle" };
  return AUDIT_EVENT[value] ?? { label: humanise(value), tone: "idle" };
}

// ── Recovery score ───────────────────────────────────────────────────────────

export function scoreBand(score: number | null | undefined): LabelSpec {
  if (score == null) return { label: "—", tone: "idle" };
  if (score >= 75) return { label: "Strong", tone: "pos" };
  if (score >= 50) return { label: "Moderate", tone: "info" };
  if (score >= 25) return { label: "Weak", tone: "warn" };
  return { label: "Poor", tone: "neg" };
}

// ── Event origin ─────────────────────────────────────────────────────────────
// The recovery pipeline is identical for every case. What differs is where the
// originating failure event came from, and the operator must always be able to
// tell synthetic evaluation data apart from real merchant traffic.

export type Origin = "live" | "test" | "synthetic";

export function originOf(razorpayPaymentId: string | null | undefined): Origin {
  if (!razorpayPaymentId) return "live";
  if (razorpayPaymentId.startsWith("batch_")) return "synthetic";
  if (razorpayPaymentId.startsWith("test_") || razorpayPaymentId.startsWith("demo_")) {
    return "test";
  }
  return "live";
}

export const ORIGIN_LABEL: Record<Origin, { label: string; hint: string }> = {
  live: {
    label: "Live",
    hint: "Originated from a real Razorpay webhook.",
  },
  test: {
    label: "Test run",
    hint: "Failure event created from the Test Agent page. The recovery pipeline and all integrations ran for real.",
  },
  synthetic: {
    label: "Synthetic",
    hint: "Generated evaluation data. Useful for volume, not merchant traffic.",
  },
};

// ── Shared ───────────────────────────────────────────────────────────────────

/** SCREAMING_SNAKE → Sentence case, for values we have no explicit label for. */
export function humanise(value: string): string {
  const spaced = value.replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Short, stable, human-quotable case reference derived from the case id. */
export function caseRef(id: string | null | undefined): string {
  if (!id) return "—";
  const tail = id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `RGA-${tail}`;
}

/**
 * Tailwind classes per tone. Kept as complete literal strings so Tailwind's
 * scanner can see them — never build these by interpolation.
 */
export const TONE_TEXT: Record<Tone, string> = {
  pos: "text-pos",
  warn: "text-warn",
  neg: "text-neg",
  info: "text-info",
  idle: "text-muted-foreground",
};

export const TONE_DOT: Record<Tone, string> = {
  pos: "bg-pos",
  warn: "bg-warn",
  neg: "bg-neg",
  info: "bg-info",
  idle: "bg-idle",
};

export const TONE_CHIP: Record<Tone, string> = {
  pos: "bg-pos-soft text-pos border-pos-line",
  warn: "bg-warn-soft text-warn border-warn-line",
  neg: "bg-neg-soft text-neg border-neg-line",
  info: "bg-info-soft text-info border-info-line",
  idle: "bg-surface-2 text-muted-foreground border-border",
};
