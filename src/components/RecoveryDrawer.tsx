/**
 * AI Recovery Detail Drawer.
 *
 * Opens from the right when a case row is clicked. Shows the full AI recovery
 * analysis for that payment without navigating away from the table.
 *
 * All data comes from the existing RecoveryCase object — no new API calls.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, Check, Copy, ExternalLink, Sparkles, TrendingUp, Zap } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Field, Panel, SectionLabel, StatusBadge } from "@/components/Primitives";
import type { RecoveryCase, AuditLog } from "@/lib/api";
import {
  actionLabel,
  auditEventLabel,
  caseRef,
  caseStatus,
  channelLabel,
  diagnosisLabel,
  formatDateTime,
  formatINR,
  formatRatio,
  humanise,
  scoreBand,
} from "@/lib/format";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function customerName(c: RecoveryCase): string {
  return c.customer?.name ?? c.customer?.email ?? "Unknown customer";
}

function failureAnalysis(c: RecoveryCase): { summary: string; detail: string } {
  const reason = c.payment.errorReason ?? c.payment.errorCode ?? "payment_failed";
  const diag = c.diagnosis ?? "UNKNOWN";

  const map: Record<string, { summary: string; detail: string }> = {
    PAYMENT_METHOD_ISSUE: {
      summary: "The customer's payment method has expired or is invalid.",
      detail:
        "A generic retry will fail again. The customer needs to update or change their payment method before the payment can succeed.",
    },
    SOFT_DECLINE: {
      summary: "The bank declined the payment, but the method is still valid.",
      detail:
        "Soft declines often resolve on retry or when the customer ensures sufficient funds are available. A payment link with a short expiry is the recommended approach.",
    },
    TRANSIENT_FAILURE: {
      summary: "A temporary network or gateway error interrupted the payment.",
      detail:
        "The customer's payment method is fine. The failure was on the infrastructure side and is likely to succeed on the next attempt.",
    },
    CUSTOMER_ACTION_REQUIRED: {
      summary: "The customer needs to take an action to complete the payment.",
      detail:
        "This may be a 3D-Secure authentication, OTP confirmation, or bank approval that the customer did not complete. A direct outreach with a fresh payment link is most effective.",
    },
    HARD_DECLINE: {
      summary: "The bank has firmly declined this payment.",
      detail:
        "Hard declines usually cannot be resolved by retrying the same method. The customer may need to use a different payment instrument.",
    },
    HIGH_RISK: {
      summary: "This payment carries risk signals that prevent automatic recovery.",
      detail:
        "The agent has escalated this case for human review. No automated outreach will be sent until a person reviews and approves an action.",
    },
    UNKNOWN: {
      summary: `Payment failed with reason: ${humanise(reason)}.`,
      detail:
        "The agent has assessed the available context and will attempt a safe outreach to the customer to prompt them to retry.",
    },
  };

  return map[diag] ?? map["UNKNOWN"];
}

function scoreFactors(c: RecoveryCase): { label: string; positive: boolean }[] {
  const factors: { label: string; positive: boolean }[] = [];
  if (c.diagnosis && c.diagnosis !== "UNKNOWN" && c.diagnosis !== "HIGH_RISK") {
    factors.push({ label: "Known failure reason", positive: true });
  }
  if (c.customer?.phone || c.customer?.email) {
    factors.push({ label: "Customer contact available", positive: true });
  }
  if (c.customer?.successfulPayments && c.customer.successfulPayments > 0) {
    factors.push({ label: "Returning customer", positive: true });
  }
  const age = Date.now() - new Date(c.createdAt).getTime();
  if (age < 48 * 60 * 60 * 1000) {
    factors.push({ label: "Recent transaction", positive: true });
  }
  if (c.diagnosis === "PAYMENT_METHOD_ISSUE" || c.diagnosis === "HARD_DECLINE") {
    factors.push({ label: "Method change required", positive: false });
  }
  if (c.diagnosis === "HIGH_RISK") {
    factors.push({ label: "Risk signals detected", positive: false });
  }
  if (c.customer && c.customer.failedPayments > 3) {
    factors.push({ label: "Multiple prior failures", positive: false });
  }
  if (c.diagnosis === "SOFT_DECLINE" || c.diagnosis === "TRANSIENT_FAILURE") {
    factors.push({ label: "Recoverable payment state", positive: true });
  }
  return factors;
}

function strategyReasons(c: RecoveryCase): string[] {
  const reasons: string[] = [];
  if (c.diagnosis && c.diagnosis !== "UNKNOWN") reasons.push("Failure reason is actionable");
  if (c.customer?.phone) reasons.push("Customer is reachable via WhatsApp");
  else if (c.customer?.email) reasons.push("Customer is reachable via email");
  const age = Date.now() - new Date(c.createdAt).getTime();
  if (age < 24 * 60 * 60 * 1000) reasons.push("Payment is recent");
  if ((c.recoverabilityProbability ?? 0) > 0.4) reasons.push("Recovery probability is reasonable");
  if (c.customer?.successfulPayments && c.customer.successfulPayments > 0) {
    reasons.push("Customer has prior successful payments");
  }
  return reasons.length > 0 ? reasons : ["Agent evaluated available payment context"];
}

function buildMessage(c: RecoveryCase): string {
  const name = c.customer?.name ?? "there";
  const amount = formatINR(c.payment.amount);
  const orderId = c.order?.razorpayOrderId ?? "your order";
  const reason = c.payment.errorReason ?? "an issue with your payment";
  const link = c.paymentLinkUrl;

  if (c.diagnosis === "PAYMENT_METHOD_ISSUE") {
    return `Hi ${name} 👋\n\nWe couldn't process your ${amount} payment because the card used has expired or is invalid.\n\nYou can retry your payment using a different payment method.\n\nOrder ID: ${orderId}${link ? `\n\nRetry here: ${link}` : ""}`;
  }
  if (c.diagnosis === "SOFT_DECLINE") {
    return `Hi ${name} 👋\n\nYour ${amount} payment was declined by your bank. This sometimes happens due to insufficient balance or temporary restrictions.\n\nPlease ensure your account has sufficient funds and try again.\n\nOrder ID: ${orderId}${link ? `\n\nPay here: ${link}` : ""}`;
  }
  if (c.diagnosis === "TRANSIENT_FAILURE") {
    return `Hi ${name} 👋\n\nYour ${amount} payment for order ${orderId} failed due to a temporary network issue — your card is fine.\n\nPlease try again${link ? ` using the link below:\n${link}` : "."}`;
  }
  return `Hi ${name} 👋\n\nWe noticed your ${amount} payment for order ${orderId} didn't go through (${humanise(reason)}).\n\nPlease retry your payment at your earliest convenience.${link ? `\n\nPay here: ${link}` : ""}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - clamped / 100);
  const band = scoreBand(clamped);
  const strokeColor =
    band.tone === "pos"
      ? "stroke-pos"
      : band.tone === "info"
        ? "stroke-info"
        : band.tone === "warn"
          ? "stroke-warn"
          : "stroke-neg";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center">
        <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90" aria-hidden>
          <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-border" />
          <circle
            cx="48" cy="48" r={r} fill="none" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            className={cn("transition-[stroke-dashoffset] duration-700", strokeColor)}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-[22px] font-bold leading-6 tabular-nums text-foreground">{Math.round(clamped)}</span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <StatusBadge tone={band.tone}>{band.label}</StatusBadge>
    </div>
  );
}

function TimelineStep({
  label, detail, tone, time, last,
}: {
  label: string; detail: string; tone: "pos" | "info" | "warn" | "neg" | "idle"; time?: string; last?: boolean;
}) {
  const dotColor = tone === "pos" ? "bg-pos" : tone === "info" ? "bg-info" : tone === "warn" ? "bg-warn" : tone === "neg" ? "bg-neg" : "bg-idle";
  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", dotColor)} />
        {!last && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className={cn("min-w-0 pb-4", last && "pb-0")}>
        <p className="text-[12.5px] font-medium leading-4 text-foreground">{label}</p>
        <p className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground">{detail}</p>
        {time && <p className="mt-0.5 text-[10.5px] text-muted-foreground/70">{time}</p>}
      </div>
    </div>
  );
}

function buildTimeline(c: RecoveryCase) {
  if (c.auditLogs && c.auditLogs.length > 0) {
    return c.auditLogs
      .filter((log: AuditLog) => [
        "PAYMENT_FAILED", "CASE_CREATED", "AI_DIAGNOSIS", "POLICY_DECISION",
        "ACTION_APPROVED", "ACTION_DENIED", "PAYMENT_LINK_CREATED",
        "WHATSAPP_SENT", "EMAIL_SENT", "RETRY_SCHEDULED", "ESCALATED",
        "RECOVERY_COMPLETED", "RECOVERY_STOPPED",
      ].includes(log.eventType))
      .map((log: AuditLog) => {
        const ev = auditEventLabel(log.eventType);
        return { label: ev.label, detail: log.reason ?? "", tone: ev.tone as "pos" | "info" | "warn" | "neg" | "idle", time: formatDateTime(log.createdAt) };
      });
  }

  const steps: { label: string; detail: string; tone: "pos" | "info" | "warn" | "neg" | "idle"; time?: string }[] = [
    { label: "Payment Failed", detail: `Payment attempt failed — ${humanise(c.payment.errorReason ?? "reason unknown")}.`, tone: "neg", time: formatDateTime(c.createdAt) },
    { label: "Failure Analysed", detail: "AI identified the failure reason.", tone: "info" },
    { label: "Customer Context Checked", detail: "Customer and payment history evaluated.", tone: "info" },
  ];
  if (c.diagnosis && c.diagnosis !== "UNKNOWN") {
    steps.push({ label: "Recovery Strategy Selected", detail: `Agent selected: ${actionLabel(c.approvedAction).label}.`, tone: "info" });
  }
  if (c.channel) {
    steps.push({ label: `${channelLabel(c.channel)} Selected`, detail: `${channelLabel(c.channel)} recommended based on customer availability.`, tone: "info" });
  }
  if (c.status === "WAITING_FOR_OUTCOME" || c.outreachCount > 0) {
    steps.push({ label: "Message Sent", detail: "Recovery message delivered to the customer.", tone: "pos", time: formatDateTime(c.updatedAt) });
  }
  if (c.status === "RECOVERED") {
    steps.push({ label: "Payment Recovered", detail: "Customer completed payment.", tone: "pos", time: formatDateTime(c.updatedAt) });
  }
  if (c.status === "ESCALATED") {
    steps.push({ label: "Escalated for Review", detail: c.escalationReason ?? "Case requires human review.", tone: "neg", time: formatDateTime(c.updatedAt) });
  }
  return steps;
}

// ── Main component ────────────────────────────────────────────────────────────

export function RecoveryDrawer({ selected, onClose }: { selected: RecoveryCase | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const c = selected;

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  if (!c) {
    return <Sheet open={false} onOpenChange={() => onClose()}><SheetContent side="right" className="w-full sm:max-w-130 p-0 overflow-y-auto" /></Sheet>;
  }

  const analysis = failureAnalysis(c);
  const factors = scoreFactors(c);
  const reasons = strategyReasons(c);
  const message = buildMessage(c);
  const timeline = buildTimeline(c);
  const status = caseStatus(c.status);
  const diagnosis = diagnosisLabel(c.diagnosis);
  const action = actionLabel(c.approvedAction);
  const score = c.recoveryScore != null ? Number(c.recoveryScore) : null;
  const confidence = c.diagnosisConfidence != null ? Number(c.diagnosisConfidence) : null;

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-130 p-0 overflow-y-auto flex flex-col gap-0">

        {/* Header */}
        <SheetHeader className="border-b border-border px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Bot className="size-3.5" aria-hidden />
            </span>
            <SheetTitle className="text-[15px] font-semibold">AI Recovery Analysis</SheetTitle>
          </div>
          <div className="mt-2 rounded-md border border-border bg-surface-2 px-3.5 py-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold leading-5 text-foreground truncate">{customerName(c)}</p>
                {c.customer?.email && <p className="text-[11.5px] text-muted-foreground truncate">{c.customer.email}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[16px] font-bold text-foreground">{formatINR(c.payment.amount)}</p>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]">
              <div><span className="text-muted-foreground">Order </span><span className="mono text-foreground">{c.order?.razorpayOrderId ?? caseRef(c.id)}</span></div>
              <div><span className="text-muted-foreground">Failure </span><span className="text-foreground">{humanise(c.payment.errorReason ?? c.payment.errorCode ?? "unknown")}</span></div>
              <div className="col-span-2"><span className="text-muted-foreground">Case </span><span className="mono text-foreground">{caseRef(c.id)}</span></div>
            </div>
          </div>
          <SheetDescription className="sr-only">AI recovery analysis for {customerName(c)}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Section 1 — AI Analysis */}
          <section>
            <SectionLabel className="mb-3">
              <span className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-info" aria-hidden />AI Analysis</span>
            </SectionLabel>
            <Panel className="px-4 py-3.5 space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1">Payment failure identified</p>
                <p className="text-[13px] leading-5 text-foreground">{analysis.summary}</p>
              </div>
              <p className="text-[12.5px] leading-5 text-muted-foreground border-t border-hairline pt-3">{analysis.detail}</p>
              <div className="border-t border-hairline pt-3 flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Diagnosis</p>
                <StatusBadge tone={diagnosis.tone}>{diagnosis.label}</StatusBadge>
                {confidence != null && <span className="text-[11.5px] text-muted-foreground">{formatRatio(confidence)} confidence</span>}
              </div>
              {c.llmReason && <p className="text-[12px] leading-4 text-muted-foreground italic border-t border-hairline pt-3">{c.llmReason}</p>}
              <div className="border-t border-hairline pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">Recommended Action</p>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={action.tone}>{action.label}</StatusBadge>
                  {c.channel && c.channel !== "NONE" && <span className="text-[12px] text-muted-foreground">via {channelLabel(c.channel)}</span>}
                </div>
                <p className="mt-1.5 text-[12px] leading-4 text-muted-foreground">
                  {c.policyReason ?? "The agent evaluated the failure type, customer contact availability, and recovery economics to select this action."}
                </p>
              </div>
            </Panel>
          </section>

          {/* Section 2 — Recovery Score */}
          {score != null && (
            <section>
              <SectionLabel className="mb-3">
                <span className="flex items-center gap-1.5"><TrendingUp className="size-3.5 text-info" aria-hidden />Recovery Score</span>
              </SectionLabel>
              <Panel className="px-4 py-4">
                <div className="flex items-start gap-5">
                  <ScoreRing score={score} />
                  <div className="min-w-0 flex-1 space-y-1.5 pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-2">Score factors</p>
                    {factors.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className={cn("shrink-0 text-[12px]", f.positive ? "text-pos" : "text-neg")}>{f.positive ? "✓" : "✗"}</span>
                        <span className={cn("text-[12.5px]", f.positive ? "text-foreground" : "text-muted-foreground")}>{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            </section>
          )}

          {/* Section 3 — Agent Decision */}
          <section>
            <SectionLabel className="mb-3">
              <span className="flex items-center gap-1.5"><Zap className="size-3.5 text-warn" aria-hidden />Agent Decision</span>
            </SectionLabel>
            <Panel className="px-4 py-3.5 space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">Recommended strategy</p>
                <StatusBadge tone={action.tone} dot={false} className="text-[12.5px] px-2 py-1">{action.label}</StatusBadge>
              </div>
              <div className="border-t border-hairline pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-2">Why this strategy?</p>
                <ul className="space-y-1">
                  {reasons.map((r, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-[12.5px] text-foreground">
                      <span className="size-1 rounded-full bg-pos shrink-0" aria-hidden />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-hairline pt-3 flex flex-wrap gap-2">
                <Link
                  to="/recovery/$id"
                  params={{ id: c.id }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  View full case
                </Link>
                {c.paymentLinkUrl && (
                  <a href={c.paymentLinkUrl} target="_blank" rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[12.5px] font-medium hover:bg-accent transition-colors">
                    <ExternalLink className="size-3.5" aria-hidden />
                    Payment link
                  </a>
                )}
              </div>
            </Panel>
          </section>

          {/* Section 4 — Timeline */}
          <section>
            <SectionLabel className="mb-3">Agent Activity</SectionLabel>
            <Panel className="px-4 py-3.5">
              {timeline.map((step, i) => (
                <TimelineStep key={i} label={step.label} detail={step.detail} tone={step.tone} time={step.time} last={i === timeline.length - 1} />
              ))}
            </Panel>
          </section>

          {/* Section 5 — Message Preview */}
          <section>
            <SectionLabel className="mb-3">Generated Recovery Message</SectionLabel>
            <Panel className="px-4 py-3.5 space-y-3">
              <pre className="whitespace-pre-wrap rounded-md bg-surface-2 border border-border px-3 py-3 text-[12.5px] leading-5 text-foreground font-sans">
                {message}
              </pre>
              <button
                type="button"
                onClick={() => handleCopy(message)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[12.5px] font-medium hover:bg-accent transition-colors"
              >
                {copied ? <Check className="size-3.5 text-pos" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {copied ? "Copied!" : "Copy message"}
              </button>
            </Panel>
          </section>

        </div>
      </SheetContent>
    </Sheet>
  );
}
