/**
 * Typed API client — all calls go through the backend on port 3000.
 * Never expose secrets; backend handles all provider calls.
 */

import { isOperatorText } from "./safeText";

// In Vite, VITE_* env vars are statically replaced at build time via import.meta.env.
//
// Local development falls back to the dev backend on port 3000. A deployed build
// has no such thing, so a production bundle that was built without
// VITE_API_BASE_URL is broken — every request would be aimed at the visitor's own
// machine. That is a silent, baffling failure, so it is named out loud below and
// folded into the "can't reach the service" message the UI already shows.
const env = import.meta.env as Record<string, unknown>;
const RAW_BASE = typeof env["VITE_API_BASE_URL"] === "string" ? env["VITE_API_BASE_URL"].trim() : "";

/** True when this bundle shipped without an API base URL and is guessing. */
const BASE_IS_FALLBACK = RAW_BASE.length === 0;
const IS_PRODUCTION_BUILD = env["PROD"] === true;

// The fallback is the local dev backend, deliberately. It must never be the
// dashboard's own origin: `/api/*` is not in this app's route tree, so those
// requests would be answered by the SSR server with a 500 that looks exactly
// like a backend fault, sending you to debug Prisma when the real problem is a
// missing environment variable.
const BASE: string = BASE_IS_FALLBACK ? "http://localhost:3000" : RAW_BASE.replace(/\/+$/, "");

if (BASE_IS_FALLBACK && IS_PRODUCTION_BUILD) {
  console.error(
    "[config] VITE_API_BASE_URL was not set at build time, so this bundle is " +
      "pointing at http://localhost:3000 and cannot reach the recovery service. " +
      "Set it in the Vercel project and redeploy — it is baked in at build time.",
  );
}

/**
 * An API failure the UI can show a person. `message` is always safe to render;
 * `fieldErrors` maps a form path (e.g. "customer.email") to a message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/** Turns any transport or backend failure into something safe to display. */
function friendlyMessage(status: number): string {
  if (status === 0) {
    return BASE_IS_FALLBACK && IS_PRODUCTION_BUILD
      ? "This build has no backend address configured, so it can't reach the recovery service."
      : "Can't reach the recovery service. Check that the backend is running.";
  }
  if (status === 404) return "That record no longer exists.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status >= 500) return "The recovery service ran into a problem. Try again in a moment.";
  return "That request could not be completed.";
}

/**
 * Markers of a message that was written for a log file rather than a person:
 * stack frames, transport codes, driver names, file paths, serialised objects,
 * and anything shaped like a credential. A backend that stringifies a caught
 * error (`String(err)`) will match one of these, and the generic line is used
 * instead so provider internals never reach the screen.
 *
 * The predicate itself lives in `safeText`, which the UI shares for the same
 * purpose on audit rows and recorded action errors.
 */
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...options?.headers },
      ...options,
    });
  } catch {
    throw new ApiError(0, friendlyMessage(0));
  }

  if (!res.ok) {
    // Prefer the backend's own message when it wrote one for an operator, and
    // only when it survives `isDisplayable`. Raw response bodies are never
    // surfaced, so provider errors and stack traces cannot leak.
    let message = friendlyMessage(res.status);
    let fieldErrors: Record<string, string> = {};
    try {
      const body = (await res.json()) as {
        error?: unknown;
        fieldErrors?: Record<string, string>;
      };
      if (typeof body?.error === "string" && isOperatorText(body.error)) {
        message = body.error.trim();
      }
      if (body?.fieldErrors && typeof body.fieldErrors === "object") {
        fieldErrors = body.fieldErrors;
      }
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(res.status, message, fieldErrors);
  }

  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  revenueAtRisk: number;
  revenueRecovered: number;
  recoveryRate: number;
  casesEvaluated: number;
  interventions: number;
  successfulRecoveries: number;
  escalations: number;
}

export interface ActivityItem {
  id: string;
  eventType: string;
  reason: string | null;
  createdAt: string;
  case?: {
    id: string;
    payment?: { amount: number; currency: string };
    customer?: { name: string | null; email: string | null };
  } | null;
}

export interface RecoveryCase {
  id: string;
  status: string;
  diagnosis: string | null;
  diagnosisConfidence: number | null;
  recoverabilityProbability: number | null;
  recoveryScore: number | null;
  expectedRecoveryValue: number | null;
  recommendedAction: string | null;
  approvedAction: string | null;
  channel: string | null;
  retryCount: number;
  outreachCount: number;
  recoveredAmount: number | null;
  amountDue: number | null;
  paymentLinkUrl: string | null;
  razorpayPaymentLinkId: string | null;
  llmReason: string | null;
  policyDecision: string | null;
  policyReason: string | null;
  escalationReason: string | null;
  stopReason: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    lifetimeValue: number;
    successfulPayments: number;
    failedPayments: number;
    communicationPreference: string;
  } | null;
  payment: {
    id: string;
    razorpayPaymentId: string;
    amount: number;
    currency: string;
    method: string | null;
    status: string;
    errorCode: string | null;
    errorReason: string | null;
  };
  order?: {
    id: string;
    razorpayOrderId: string;
    amount: number;
    status: string;
  } | null;
  actions?: RecoveryAction[];
  auditLogs?: AuditLog[];
  escalation?: Escalation | null;
}

export interface RecoveryAction {
  id: string;
  action: string;
  channel: string | null;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  executedAt: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  eventType: string;
  decision: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Escalation {
  id: string;
  amount: number;
  failure: string | null;
  diagnosis: string | null;
  confidence: number | null;
  reason: string;
  recommendedNextStep: string | null;
  createdAt: string;
}

export interface PolicySettings {
  id?: string;
  maxRetryAttempts: number;
  maxOutreachAttempts: number;
  cooldownHours: number;
  minimumRecoveryValue: number;
  highValueThreshold: number;
  lowConfidenceThreshold: number;
}

// ── System status ──────────────────────────────────────────────────────────
// Booleans and mode labels only — the backend never sends key material here.

export interface SystemStatus {
  operational: boolean;
  database: boolean;
  integrations: {
    razorpay: boolean;
    ai: boolean;
    aiFallbackAvailable: boolean;
    whatsapp: boolean;
    email: boolean;
    webhookVerification: boolean;
  };
  razorpayMode: "test" | "live" | "not_configured";
  limits: {
    maxRetryAttempts: number;
    maxOutreachAttempts: number;
  };
  checkedAt: string;
}

// ── Test Agent ─────────────────────────────────────────────────────────────

export interface TestScenario {
  id: string;
  label: string;
  description: string;
}

export interface TestAgentRunRequest {
  customer: {
    name: string;
    phone: string;
    email: string;
    isRepeatCustomer: boolean;
    successfulPayments: number;
    lifetimeValue: number;
    failedPayments: number;
  };
  payment: {
    amount: number;
    scenario: string;
    currency: string;
  };
  consent: boolean;
}

export interface TestAgentRunStarted {
  ok: boolean;
  paymentId: string;
  orderId: string;
  scenario: { id: string; label: string };
  /** Masked for display — the backend holds the real contact details. */
  contact: { whatsapp: string | null; email: string | null };
}

export interface TestAgentRunState {
  paymentId: string;
  orderId: string | null;
  run: {
    state: "RUNNING" | "COMPLETED" | "FAILED";
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  };
  case: RecoveryCase | null;
}

export interface CaseListFilters {
  status?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  q?: string | undefined;
  diagnosis?: string | undefined;
  channel?: string | undefined;
  source?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

// ── API calls ──────────────────────────────────────────────────────────────

export const api = {
  dashboard: {
    metrics: () => apiFetch<DashboardMetrics>("/api/dashboard/metrics"),
    activity: () => apiFetch<{ activity: ActivityItem[] }>("/api/dashboard/activity"),
  },
  recovery: {
    list: (params?: CaseListFilters) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.q) qs.set("q", params.q);
      if (params?.diagnosis) qs.set("diagnosis", params.diagnosis);
      if (params?.channel) qs.set("channel", params.channel);
      if (params?.source) qs.set("source", params.source);
      if (params?.from) qs.set("from", params.from);
      if (params?.to) qs.set("to", params.to);
      return apiFetch<{ cases: RecoveryCase[]; total: number; page: number; limit: number }>(
        `/api/recovery/cases?${qs}`,
      );
    },
    get: (id: string) => apiFetch<RecoveryCase>(`/api/recovery/cases/${id}`),
    stop: (id: string, reason?: string) =>
      apiFetch<RecoveryCase>(`/api/recovery/cases/${id}/stop`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    escalate: (id: string) =>
      apiFetch<RecoveryCase>(`/api/recovery/cases/${id}/escalate`, { method: "POST" }),
  },
  settings: {
    get: () => apiFetch<PolicySettings>("/api/settings"),
    save: (data: Partial<PolicySettings>) =>
      apiFetch<PolicySettings>("/api/settings", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  demo: {
    paymentFailed: (data: unknown) =>
      apiFetch("/api/demo/payment-failed", { method: "POST", body: JSON.stringify(data) }),
    paymentCaptured: (paymentId: string) =>
      apiFetch<{ ok: boolean; paymentId: string; status: string }>(
        "/api/demo/payment-captured",
        { method: "POST", body: JSON.stringify({ paymentId }) },
      ),
    generateBatch: (count = 100) =>
      apiFetch<{ ok: boolean; generated: number; failed: number }>(
        "/api/demo/generate-batch",
        { method: "POST", body: JSON.stringify({ count }) },
      ),
  },
  system: {
    status: () => apiFetch<SystemStatus>("/api/system/status"),
  },
  testAgent: {
    scenarios: () => apiFetch<{ scenarios: TestScenario[] }>("/api/test-agent/scenarios"),
    run: (data: TestAgentRunRequest) =>
      apiFetch<TestAgentRunStarted>("/api/test-agent/run", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    state: (paymentId: string) =>
      apiFetch<TestAgentRunState>(`/api/test-agent/run/${encodeURIComponent(paymentId)}`),
    createCheckoutOrder: (data: { amount: number; currency?: string; name?: string; email?: string; phone?: string }) =>
      apiFetch<{ orderId: string; amount: number; currency: string; keyId: string; prefill: { name: string; email: string; contact: string } }>(
        "/api/test-agent/checkout-order",
        { method: "POST", body: JSON.stringify(data) },
      ),
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────
// Presentation lives in lib/format.ts. Re-exported here so existing imports
// from "@/lib/api" keep working.

export { formatINR } from "./format";
