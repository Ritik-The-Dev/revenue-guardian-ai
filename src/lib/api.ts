/**
 * Typed API client — all calls go through the backend on port 3000.
 * Never expose secrets; backend handles all provider calls.
 */

const BASE = "http://localhost:3000";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
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

// ── API calls ──────────────────────────────────────────────────────────────

export const api = {
  dashboard: {
    metrics: () => apiFetch<DashboardMetrics>("/api/dashboard/metrics"),
    activity: () => apiFetch<{ activity: ActivityItem[] }>("/api/dashboard/activity"),
  },
  recovery: {
    list: (params?: { status?: string; page?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
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
      apiFetch("/api/demo/payment-captured", {
        method: "POST",
        body: JSON.stringify({ paymentId }),
      }),
    generateBatch: (count = 100) =>
      apiFetch<{ ok: boolean; generated: number; failed: number }>(
        "/api/demo/generate-batch",
        { method: "POST", body: JSON.stringify({ count }) },
      ),
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

export function formatINR(amount: number | null | undefined) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function scoreLabel(score: number | null | undefined) {
  if (score == null) return { label: "—", color: "text-muted-foreground" };
  if (score <= 30) return { label: "LOW", color: "text-red-500" };
  if (score <= 60) return { label: "MEDIUM", color: "text-yellow-500" };
  if (score <= 80) return { label: "HIGH", color: "text-blue-500" };
  return { label: "CRITICAL", color: "text-green-600" };
}

export function statusColor(status: string) {
  const map: Record<string, string> = {
    RECOVERED: "bg-green-100 text-green-800",
    ESCALATED: "bg-red-100 text-red-800",
    STOPPED: "bg-gray-100 text-gray-600",
    WAITING_FOR_OUTCOME: "bg-blue-100 text-blue-800",
    ANALYZING: "bg-yellow-100 text-yellow-800",
    RETRY_PENDING: "bg-purple-100 text-purple-800",
    NEW: "bg-slate-100 text-slate-700",
    ACTION_PLANNED: "bg-indigo-100 text-indigo-800",
    ACTION_EXECUTED: "bg-teal-100 text-teal-800",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}
