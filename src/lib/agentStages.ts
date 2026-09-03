/**
 * Agent stage derivation.
 *
 * The agent's run is presented as eight stages. Nothing here is scripted or
 * simulated: every stage's state, timestamp and detail line is read out of the
 * audit rows and case fields the backend actually persisted. If the backend
 * never wrote the evidence, the stage does not claim to have happened.
 *
 * A stage can be:
 *   DONE    — the backend recorded that it happened
 *   ACTIVE  — the pipeline is still running and this is the next thing it does
 *   PENDING — not reached yet
 *   SKIPPED — deliberately not performed (policy said no, or it does not apply)
 *   FAILED  — attempted and recorded as failed
 */

import type { AuditLog, RecoveryCase, TestAgentRunState } from "./api";
import {
  actionLabel,
  channelLabel,
  diagnosisLabel,
  formatINR,
  formatRatio,
  originOf,
  policyLabel,
  scoreBand,
  type Tone,
} from "./format";
import { operatorText } from "./safeText";

export type StageState = "PENDING" | "ACTIVE" | "DONE" | "SKIPPED" | "FAILED";

export type StageId =
  | "failure"
  | "context"
  | "diagnosis"
  | "opportunity"
  | "policy"
  | "action"
  | "notification"
  | "outcome";

export interface StageDetail {
  label: string;
  value: string;
  mono: boolean;
  tone: Tone | null;
}

export interface AgentStage {
  id: StageId;
  title: string;
  /** What the stage does, shown while it has not produced a result yet. */
  waitingLabel: string;
  state: StageState;
  /** The recorded outcome in operator language. Null until there is one. */
  summary: string | null;
  /** ISO timestamp of the evidence, when the backend recorded one. */
  at: string | null;
  details: StageDetail[];
  tone: Tone;
}

function d(
  label: string,
  value: string,
  // `| undefined` is deliberate: callers pass a conditional tone, and the
  // project compiles with exactOptionalPropertyTypes.
  options?: { mono?: boolean | undefined; tone?: Tone | undefined },
): StageDetail {
  return {
    label,
    value,
    mono: options?.mono ?? false,
    tone: options?.tone ?? null,
  };
}

interface Evidence {
  done: boolean;
  at: string | null;
  summary: string | null;
  details: StageDetail[];
  tone: Tone;
  /** Set when the stage was deliberately not performed. */
  skipped: string | null;
  /** Set when the stage was attempted and recorded as failed. */
  failed: string | null;
  /** Set when the stage is genuinely in progress regardless of run state. */
  active: boolean;
}

const NOTHING: Evidence = {
  done: false,
  at: null,
  summary: null,
  details: [],
  tone: "idle",
  skipped: null,
  failed: null,
  active: false,
};

function ev(partial: Partial<Evidence>): Evidence {
  return { ...NOTHING, ...partial };
}

const STAGE_META: Record<StageId, { title: string; waitingLabel: string }> = {
  failure: {
    title: "Payment failure received",
    waitingLabel: "Recording the failure event",
  },
  context: {
    title: "Customer context loaded",
    waitingLabel: "Loading payment history",
  },
  diagnosis: {
    title: "Failure diagnosed",
    waitingLabel: "Classifying the failure reason",
  },
  opportunity: {
    title: "Recovery opportunity scored",
    waitingLabel: "Scoring recoverability and expected value",
  },
  policy: {
    title: "Policy evaluated",
    waitingLabel: "Checking the decision against policy limits",
  },
  action: {
    title: "Recovery action executed",
    waitingLabel: "Preparing the approved action",
  },
  notification: {
    title: "Customer notified",
    waitingLabel: "Delivering the message",
  },
  outcome: {
    title: "Payment outcome",
    waitingLabel: "Waiting for Razorpay to confirm payment",
  },
};

const STAGE_ORDER: StageId[] = [
  "failure",
  "context",
  "diagnosis",
  "opportunity",
  "policy",
  "action",
  "notification",
  "outcome",
];

/** Actions that result in a message being sent to the customer. */
const OUTREACH_ACTIONS = new Set([
  "SEND_PAYMENT_LINK",
  "REQUEST_PAYMENT_METHOD_UPDATE",
  "SEND_REMINDER",
]);

function metaString(log: AuditLog | null, key: string): string | null {
  if (!log) return null;
  const value = log.metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metaBool(log: AuditLog | null, key: string): boolean | null {
  if (!log) return null;
  const value = log.metadata[key];
  return typeof value === "boolean" ? value : null;
}

export interface DeriveOptions {
  /** Live pipeline state, when this case came from a Test Agent run. */
  run?: TestAgentRunState["run"] | null;
}

export function deriveStages(
  item: RecoveryCase | null,
  options: DeriveOptions = {},
): AgentStage[] {
  const run = options.run ?? null;
  const running = run?.state === "RUNNING";
  const runFailed = run?.state === "FAILED";

  const logs: AuditLog[] = item?.auditLogs ?? [];
  const firstOf = (type: string): AuditLog | null =>
    logs.find((log) => log.eventType === type) ?? null;
  const lastOf = (type: string): AuditLog | null => {
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      const log = logs[i];
      if (log && log.eventType === type) return log;
    }
    return null;
  };

  const evidence: Record<StageId, Evidence> = {
    failure: failureEvidence(item, firstOf("PAYMENT_FAILED")),
    context: contextEvidence(item, firstOf("CASE_CREATED")),
    diagnosis: diagnosisEvidence(item, firstOf("AI_DIAGNOSIS")),
    opportunity: opportunityEvidence(item),
    policy: policyEvidence(item, firstOf("POLICY_DECISION")),
    action: actionEvidence(item, { firstOf, lastOf }),
    notification: notificationEvidence(item, { firstOf, lastOf }),
    outcome: outcomeEvidence(item, { firstOf, lastOf }),
  };

  // Assign states in order. The first stage without evidence is the one the
  // pipeline is working on — but only while the pipeline is genuinely running.
  let reachedUnknown = false;
  return STAGE_ORDER.map((id) => {
    const e = evidence[id];
    const meta = STAGE_META[id];
    let state: StageState;

    if (e.done) {
      state = "DONE";
    } else if (e.failed) {
      state = "FAILED";
    } else if (e.skipped) {
      state = "SKIPPED";
    } else if (e.active) {
      state = "ACTIVE";
    } else if (!reachedUnknown && runFailed) {
      state = "FAILED";
      reachedUnknown = true;
    } else if (!reachedUnknown && running) {
      state = "ACTIVE";
      reachedUnknown = true;
    } else if (running) {
      state = "PENDING";
    } else {
      // Not running and no evidence: the pipeline moved past this without
      // recording it. Say so plainly rather than implying it is coming.
      state = reachedUnknown ? "PENDING" : "SKIPPED";
      reachedUnknown = true;
    }

    const summary =
      e.summary ??
      (state === "FAILED"
        ? (e.failed ?? operatorText(run?.error, "This step did not complete."))
        : null) ??
      (state === "SKIPPED" ? e.skipped : null);

    return {
      id,
      title: meta.title,
      waitingLabel: meta.waitingLabel,
      state,
      summary,
      at: e.at,
      details: e.details,
      tone: state === "FAILED" ? "neg" : e.tone,
    } satisfies AgentStage;
  });
}

// ── Per-stage evidence ───────────────────────────────────────────────────────

function failureEvidence(item: RecoveryCase | null, log: AuditLog | null): Evidence {
  if (!item) return NOTHING;
  const p = item.payment;
  const details: StageDetail[] = [
    d("Payment", p.razorpayPaymentId, { mono: true }),
    d("Amount", formatINR(p.amount)),
  ];
  if (p.method) details.push(d("Method", p.method.toUpperCase()));
  if (p.errorReason) details.push(d("Reason", p.errorReason, { mono: true, tone: "neg" }));
  if (p.errorCode) details.push(d("Code", p.errorCode, { mono: true }));

  return ev({
    done: true,
    at: log?.createdAt ?? item.createdAt,
    summary: failureSourceSentence(p.razorpayPaymentId, p.amount),
    details,
    tone: "neg",
  });
}

/**
 * Names where the failure event actually came from. Only a live webhook may be
 * attributed to Razorpay; a test run or generated row must say so.
 */
function failureSourceSentence(paymentId: string, amount: number): string {
  const origin = originOf(paymentId);
  if (origin === "test") {
    return `A failed payment of ${formatINR(amount)} was submitted from the Test Agent page.`;
  }
  if (origin === "synthetic") {
    return `A generated failed payment of ${formatINR(amount)} entered the pipeline.`;
  }
  return `Razorpay reported a failed payment of ${formatINR(amount)}.`;
}

function contextEvidence(item: RecoveryCase | null, log: AuditLog | null): Evidence {
  if (!item) return NOTHING;
  const c = item.customer;
  if (!c) {
    return ev({
      skipped: "No customer record was attached to this payment.",
      at: log?.createdAt ?? null,
    });
  }

  const channels: string[] = [];
  if (c.phone) channels.push("WhatsApp");
  if (c.email) channels.push("Email");

  const details: StageDetail[] = [
    d("Customer", c.name ?? "Unnamed"),
    d("Successful payments", String(c.successfulPayments)),
    d("Failed payments", String(c.failedPayments), {
      tone: c.failedPayments > 2 ? "warn" : undefined,
    }),
    d("Lifetime value", formatINR(c.lifetimeValue)),
    d("Reachable on", channels.length > 0 ? channels.join(" · ") : "No channel"),
  ];

  const repeat = c.successfulPayments > 0;
  return ev({
    done: true,
    at: log?.createdAt ?? item.createdAt,
    summary: repeat
      ? `Repeat customer with ${c.successfulPayments} successful payment${c.successfulPayments === 1 ? "" : "s"} on record.`
      : "First-time customer — no successful payment history.",
    details,
    tone: repeat ? "pos" : "idle",
  });
}

function diagnosisEvidence(item: RecoveryCase | null, log: AuditLog | null): Evidence {
  if (!item || !item.diagnosis) return NOTHING;
  const spec = diagnosisLabel(item.diagnosis);
  const usedFallback = metaBool(log, "usedFallback");

  const details: StageDetail[] = [
    d("Classification", spec.label, { tone: spec.tone }),
    d("Confidence", formatRatio(item.diagnosisConfidence)),
    d("Recoverability", formatRatio(item.recoverabilityProbability)),
  ];
  if (usedFallback !== null) {
    details.push(
      d(
        "Source",
        usedFallback ? "Deterministic rules (model unavailable)" : "Pollinations model",
        { tone: usedFallback ? "warn" : undefined },
      ),
    );
  }

  return ev({
    done: true,
    at: log?.createdAt ?? null,
    summary: item.llmReason ?? log?.reason ?? spec.hint ?? null,
    details,
    tone: spec.tone,
  });
}

function opportunityEvidence(item: RecoveryCase | null): Evidence {
  if (!item || item.recoveryScore == null) return NOTHING;
  const band = scoreBand(item.recoveryScore);
  const details: StageDetail[] = [
    d("Recovery score", `${Math.round(item.recoveryScore)} / 100`, { tone: band.tone }),
    d("Band", band.label, { tone: band.tone }),
  ];
  if (item.expectedRecoveryValue != null) {
    details.push(d("Expected recovery value", formatINR(item.expectedRecoveryValue)));
  }

  return ev({
    done: true,
    // Scoring is computed inline between the diagnosis and policy rows, so it
    // has no audit row of its own. The score itself is real; the timestamp is
    // not invented.
    at: null,
    summary:
      item.expectedRecoveryValue != null
        ? `Scored ${Math.round(item.recoveryScore)}/100 with an expected recovery value of ${formatINR(item.expectedRecoveryValue)}.`
        : `Scored ${Math.round(item.recoveryScore)}/100.`,
    details,
    tone: band.tone,
  });
}

function policyEvidence(item: RecoveryCase | null, log: AuditLog | null): Evidence {
  if (!item || !item.policyDecision) return NOTHING;
  const spec = policyLabel(item.policyDecision);
  const details: StageDetail[] = [d("Decision", spec.label, { tone: spec.tone })];
  if (item.recommendedAction) {
    details.push(d("Model proposed", actionLabel(item.recommendedAction).label));
  }
  if (item.approvedAction) {
    details.push(d("Policy approved", actionLabel(item.approvedAction).label));
  }

  return ev({
    done: true,
    at: log?.createdAt ?? null,
    summary: item.policyReason ?? log?.reason ?? null,
    details,
    tone: spec.tone,
  });
}

interface LogLookup {
  firstOf: (type: string) => AuditLog | null;
  lastOf: (type: string) => AuditLog | null;
}

function actionEvidence(item: RecoveryCase | null, look: LogLookup): Evidence {
  if (!item) return NOTHING;

  const approved = look.firstOf("ACTION_APPROVED");
  const denied = look.firstOf("ACTION_DENIED");
  const linkCreated = look.firstOf("PAYMENT_LINK_CREATED");
  const retry = look.firstOf("RETRY_SCHEDULED");
  const escalated = look.firstOf("ESCALATED");
  const stopped = look.firstOf("RECOVERY_STOPPED");

  if (!approved && !denied && !escalated && !stopped) return NOTHING;

  const action = item.approvedAction;
  const details: StageDetail[] = [];
  if (action) details.push(d("Action", actionLabel(action).label));

  if (linkCreated) {
    const url = metaString(linkCreated, "url") ?? item.paymentLinkUrl;
    if (url) details.push(d("Payment link", url, { mono: true, tone: "info" }));
    const linkId = metaString(linkCreated, "linkId") ?? item.razorpayPaymentLinkId;
    if (linkId) details.push(d("Link ID", linkId, { mono: true }));
  }
  if (retry) {
    const at = metaString(retry, "nextActionAt");
    if (at) details.push(d("Next attempt", new Date(at).toLocaleString("en-IN")));
    details.push(d("Retries used", `${item.retryCount}`));
  }

  if (escalated) {
    return ev({
      done: true,
      at: escalated.createdAt,
      summary:
        item.escalationReason ??
        escalated.reason ??
        "Handed to a person — automatic recovery is not permitted here.",
      details,
      tone: "neg",
    });
  }

  if (stopped && !approved) {
    return ev({
      done: true,
      at: stopped.createdAt,
      summary: item.stopReason ?? stopped.reason ?? "Recovery stopped.",
      details,
      tone: "idle",
    });
  }

  if (denied && !approved) {
    return ev({
      done: false,
      skipped: item.policyReason ?? denied.reason ?? "Policy did not approve an action.",
      at: denied.createdAt,
      details,
      tone: "idle",
    });
  }

  // Approved. The link-creation attempt is the only part that can fail here.
  const linkFailure =
    !linkCreated &&
    (action === "SEND_PAYMENT_LINK" || action === "REQUEST_PAYMENT_METHOD_UPDATE")
      ? look.firstOf("ACTION_FAILED")
      : null;
  const linkFailed =
    linkFailure && /payment link/i.test(linkFailure.reason ?? "") ? linkFailure : null;

  if (linkFailed) {
    return ev({
      done: false,
      failed: "The payment link could not be created. The customer was still contacted.",
      at: linkFailed.createdAt,
      details,
      tone: "neg",
    });
  }

  const summary = linkCreated
    ? "A Razorpay payment link was created for the outstanding amount."
    : retry
      ? "A retry was scheduled instead of contacting the customer now."
      : action
        ? `${actionLabel(action).label} was approved and executed.`
        : null;

  return ev({
    done: true,
    at: (linkCreated ?? retry ?? approved)?.createdAt ?? null,
    summary,
    details,
    tone: retry ? "warn" : "info",
  });
}

function notificationEvidence(item: RecoveryCase | null, look: LogLookup): Evidence {
  if (!item) return NOTHING;

  const whatsapp = look.firstOf("WHATSAPP_SENT");
  const email = look.firstOf("EMAIL_SENT");
  const sendAction = (item.actions ?? []).find(
    (a) => a.status === "SENT" || a.status === "FAILED",
  );

  const buildDetails = (channel: string): StageDetail[] => {
    const details: StageDetail[] = [d("Channel", channel)];
    if (channel === "WhatsApp" && item.customer?.phone) {
      details.push(d("Sent to", item.customer.phone, { mono: true }));
    }
    if (channel === "Email" && item.customer?.email) {
      details.push(d("Sent to", item.customer.email, { mono: true }));
    }
    if (sendAction?.providerMessageId) {
      details.push(d("Provider reference", sendAction.providerMessageId, { mono: true }));
    }
    details.push(d("Outreach used", `${item.outreachCount}`));
    return details;
  };

  if (whatsapp) {
    return ev({
      done: true,
      at: whatsapp.createdAt,
      summary: "The message was delivered to the customer's WhatsApp number.",
      details: buildDetails("WhatsApp"),
      tone: "pos",
    });
  }

  if (email) {
    const fellBack = Boolean(item.channel === "WHATSAPP");
    return ev({
      done: true,
      at: email.createdAt,
      summary: fellBack
        ? "WhatsApp was unavailable, so the message was delivered by email instead."
        : "The message was delivered to the customer's email address.",
      details: buildDetails("Email"),
      tone: "pos",
    });
  }

  // Nothing was sent. Was that deliberate, or did it fail?
  const suppressed = look.lastOf("ACTION_DENIED");
  if (suppressed && /suppressed/i.test(suppressed.reason ?? "")) {
    return ev({
      skipped: "Sending was cancelled because the payment had already been resolved.",
      at: suppressed.createdAt,
      details: [],
      tone: "idle",
    });
  }

  const failure = look.lastOf("ACTION_FAILED");
  if (failure && /(whatsapp|email)/i.test(failure.reason ?? "")) {
    return ev({
      failed: failure.reason ?? "Delivery failed.",
      at: failure.createdAt,
      details: [d("Attempted channel", channelLabel(item.channel))],
      tone: "neg",
    });
  }

  const action = item.approvedAction;
  if (action && !OUTREACH_ACTIONS.has(action)) {
    return ev({
      skipped:
        action === "SCHEDULE_RETRY"
          ? "No message was sent — the agent chose to retry the payment instead."
          : `No message is sent for ${actionLabel(action).label.toLowerCase()}.`,
      at: null,
      details: [],
      tone: "idle",
    });
  }

  if (item.policyDecision && item.policyDecision !== "ALLOW") {
    return ev({
      skipped: "Policy did not approve contacting the customer.",
      at: null,
      details: [],
      tone: "idle",
    });
  }

  if (!item.customer?.phone && !item.customer?.email) {
    return ev({
      skipped: "No contact channel is on file for this customer.",
      at: null,
      details: [],
      tone: "idle",
    });
  }

  return NOTHING;
}

function outcomeEvidence(item: RecoveryCase | null, look: LogLookup): Evidence {
  if (!item) return NOTHING;

  const captured = look.firstOf("PAYMENT_CAPTURED");
  const completed = look.firstOf("RECOVERY_COMPLETED");
  const partial = look.firstOf("PARTIAL_RECOVERY");
  const expired = look.firstOf("RECOVERY_LINK_EXPIRED");

  if (item.status === "RECOVERED" || completed || captured) {
    const details: StageDetail[] = [];
    if (item.recoveredAmount != null) {
      details.push(d("Amount recovered", formatINR(item.recoveredAmount), { tone: "pos" }));
    }
    const at = (completed ?? captured)?.createdAt ?? item.updatedAt;
    const elapsed = new Date(at).getTime() - new Date(item.createdAt).getTime();
    if (Number.isFinite(elapsed) && elapsed > 0) {
      details.push(d("Time to recovery", formatElapsed(elapsed)));
    }
    return ev({
      done: true,
      at,
      summary:
        "The payment is recorded as captured. Recovery is complete and outreach has stopped.",
      details,
      tone: "pos",
    });
  }

  if (partial) {
    return ev({
      done: true,
      at: partial.createdAt,
      summary: partial.reason ?? "Part of the outstanding amount was paid.",
      details:
        item.amountDue != null ? [d("Still outstanding", formatINR(item.amountDue), { tone: "warn" })] : [],
      tone: "warn",
    });
  }

  if (expired) {
    return ev({
      done: true,
      at: expired.createdAt,
      summary: "The payment link expired before the customer paid.",
      details: [],
      tone: "warn",
    });
  }

  if (item.status === "ESCALATED") {
    return ev({
      skipped: "Waiting on a person, not on the customer.",
      at: null,
      details: [],
      tone: "idle",
    });
  }

  if (item.status === "STOPPED") {
    return ev({
      skipped: item.stopReason ?? "Recovery was stopped before any payment was expected.",
      at: null,
      details: [],
      tone: "idle",
    });
  }

  if (item.status === "RETRY_PENDING") {
    return ev({
      active: true,
      summary: "A retry is scheduled. The outcome will be recorded when it runs.",
      at: null,
      details: [],
      tone: "warn",
    });
  }

  if (item.status === "WAITING_FOR_OUTCOME" || item.status === "ACTION_EXECUTED") {
    return ev({
      active: true,
      summary:
        "The customer has the payment link. This updates on its own as soon as the payment is confirmed.",
      at: null,
      details: [],
      tone: "info",
    });
  }

  return NOTHING;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

// ── Summary helpers ──────────────────────────────────────────────────────────

export function stageProgress(stages: AgentStage[]): {
  completed: number;
  total: number;
  activeIndex: number;
} {
  const completed = stages.filter((s) => s.state === "DONE").length;
  const activeIndex = stages.findIndex((s) => s.state === "ACTIVE");
  return { completed, total: stages.length, activeIndex };
}

/**
 * The one-line answer to "what is the agent doing right now?".
 * Only ever describes something the backend has recorded, or the stage that is
 * genuinely in flight.
 */
export function currentStageLabel(stages: AgentStage[]): string {
  const active = stages.find((s) => s.state === "ACTIVE");
  if (active) return active.waitingLabel;
  const failed = stages.find((s) => s.state === "FAILED");
  if (failed) return `${failed.title} — did not complete`;
  const done = [...stages].reverse().find((s) => s.state === "DONE");
  return done ? done.title : "Not started";
}
