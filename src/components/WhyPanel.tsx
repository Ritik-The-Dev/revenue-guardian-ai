/**
 * "Why did the agent do this?"
 *
 * The panel that makes the agent auditable. It restates, in plain language,
 * only what the backend recorded: the signal it received, the classification
 * and confidence it produced, the arithmetic behind the expected recovery
 * value, and the specific policy rule that produced the decision.
 *
 * It draws no conclusions of its own. Where a sentence contains a number, that
 * number came from the case record. Where a sentence names a rule, it is the
 * rule the backend itself reported in `policyReason`.
 */

import type { PolicySettings, RecoveryCase } from "@/lib/api";
import {
  actionLabel,
  channelLabel,
  diagnosisLabel,
  formatINR,
  formatRatio,
  originOf,
  policyLabel,
  scoreBand,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./Primitives";

interface Guardrail {
  rule: string;
  detail: string;
}

/**
 * Maps the reason string the policy engine recorded onto the guardrail it came
 * from, and names the configured limit that decided it. Matching on the
 * recorded reason keeps this honest: if the backend did not report that rule,
 * this panel does not claim it.
 */
function guardrailFor(
  item: RecoveryCase,
  limits: PolicySettings | null,
): Guardrail | null {
  const reason = item.policyReason ?? "";
  const has = (fragment: string) => reason.toLowerCase().includes(fragment);

  if (has("already recovered")) {
    return {
      rule: "A captured payment ends recovery",
      detail:
        "Once the payment is recorded as captured, no further action is permitted on the case.",
    };
  }
  if (has("maximum outreach")) {
    return {
      rule: "Outreach limit",
      detail: limits
        ? `The case had already used its ${limits.maxOutreachAttempts} permitted outreach attempt${limits.maxOutreachAttempts === 1 ? "" : "s"}, so no further message could be sent.`
        : "The case had already used every permitted outreach attempt, so no further message could be sent.",
    };
  }
  if (has("maximum retry")) {
    return {
      rule: "Retry limit",
      detail: limits
        ? `The case had already used its ${limits.maxRetryAttempts} permitted retry attempt${limits.maxRetryAttempts === 1 ? "" : "s"}.`
        : "The case had already used every permitted retry attempt.",
    };
  }
  if (has("high-risk")) {
    return {
      rule: "High risk is never automated",
      detail:
        "A high-risk classification always goes to a person. The agent has no permission to contact the customer or move money on these.",
    };
  }
  if (has("below the merchant minimum")) {
    return {
      rule: "Minimum recovery value",
      detail: limits
        ? `Expected recovery value came in under the ${formatINR(limits.minimumRecoveryValue)} floor, so pursuing it would cost more than it returns.`
        : "Expected recovery value came in under the configured floor, so pursuing it would cost more than it returns.",
    };
  }
  if (has("low confidence but transient")) {
    return {
      rule: "Bounded retry on low confidence",
      detail: limits
        ? `Confidence was below the ${formatRatio(limits.lowConfidenceThreshold)} threshold, but a transient failure has a safe deterministic path: retry once, within limits, and contact nobody.`
        : "Confidence was below the threshold, but a transient failure has a safe deterministic path: retry once, within limits, and contact nobody.",
    };
  }
  if (has("confidence is below")) {
    return {
      rule: "Confidence threshold",
      detail: limits
        ? `Confidence of ${formatRatio(item.diagnosisConfidence)} fell below the ${formatRatio(limits.lowConfidenceThreshold)} threshold, so the decision was handed to a person instead of acted on.`
        : `Confidence of ${formatRatio(item.diagnosisConfidence)} fell below the configured threshold, so the decision was handed to a person instead of acted on.`,
    };
  }
  if (has("must be updated before retry")) {
    return {
      rule: "Never retry a dead method",
      detail:
        "An expired or invalid method cannot succeed on retry, so the agent is not allowed to try. The only permitted action is asking the customer to update it.",
    };
  }
  if (has("eligible for a bounded retry")) {
    return {
      rule: "Bounded retry",
      detail:
        "A transient processor issue is likely to clear on its own, so the agent retries within its attempt limit rather than contacting the customer.",
    };
  }
  if (has("least aggressive approved action")) {
    return {
      rule: "Least aggressive action that works",
      detail: limits
        ? `A soft decline is recoverable. Above ${formatINR(limits.highValueThreshold)} the agent sends a payment link; below it, a retry is enough.`
        : "A soft decline is recoverable, so the agent takes the least intrusive action that can still collect.",
    };
  }
  if (has("customer must take action")) {
    return {
      rule: "Customer action required",
      detail:
        "The payment cannot complete without the customer doing something, so the only useful action is giving them a way to do it.",
    };
  }
  if (has("not safe for autonomous recovery")) {
    return {
      rule: "Unsafe to automate",
      detail:
        "A hard decline or an unclassifiable failure gives the agent no action it can take safely, so the case goes to a person.",
    };
  }
  if (has("passed bounded policy checks")) {
    return {
      rule: "Bounded policy checks",
      detail:
        "No guardrail blocked the proposed action, so the agent was permitted to carry out what it proposed.",
    };
  }
  return null;
}

/**
 * Names whoever actually produced the failure event. Only a live webhook may be
 * attributed to Razorpay; a test submission or a generated row says so instead.
 */
function failureSource(paymentId: string | null | undefined): string {
  const origin = originOf(paymentId);
  if (origin === "test") return "The Test Agent page submitted";
  if (origin === "synthetic") return "A generated scenario supplied";
  return "Razorpay reported";
}

function Question({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-hairline px-4 py-3.5 first:border-t-0 sm:px-5">
      <p className="text-[12.5px] font-semibold text-foreground">{question}</p>
      <div className="mt-1.5 space-y-1.5 text-[13px] leading-[1.55] text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

export function WhyPanel({
  item,
  limits,
  className,
}: {
  item: RecoveryCase;
  limits?: PolicySettings | null;
  className?: string;
}) {
  const settings = limits ?? null;
  const diagnosis = diagnosisLabel(item.diagnosis);
  const policy = policyLabel(item.policyDecision);
  const guardrail = guardrailFor(item, settings);
  const band = scoreBand(item.recoveryScore);

  const canShowArithmetic =
    item.recoverabilityProbability != null && item.expectedRecoveryValue != null;

  const proposed = item.recommendedAction;
  const approved = item.approvedAction;
  const overruled = Boolean(proposed && approved && proposed !== approved);

  return (
    <section
      className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}
    >
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-[13px] font-semibold text-foreground">
          Why did the agent do this?
        </h2>
        <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">
          Every figure below is read from this case's record. Nothing is inferred.
        </p>
      </div>

      <Question question="What did it see?">
        <p>
          {failureSource(item.payment.razorpayPaymentId)} a failed payment of{" "}
          <strong className="font-medium text-foreground">{formatINR(item.payment.amount)}</strong>
          {item.payment.method ? ` on ${item.payment.method}` : ""}
          {item.payment.errorReason ? (
            <>
              {" "}
              with the reason{" "}
              <code className="mono rounded bg-surface-2 px-1 py-px text-[11.5px] text-foreground">
                {item.payment.errorReason}
              </code>
              .
            </>
          ) : (
            "."
          )}
        </p>
        {item.customer ? (
          <p>
            The customer has{" "}
            <strong className="font-medium text-foreground">
              {item.customer.successfulPayments}
            </strong>{" "}
            successful and{" "}
            <strong className="font-medium text-foreground">{item.customer.failedPayments}</strong>{" "}
            failed payments on record, with a lifetime value of{" "}
            <strong className="font-medium text-foreground">
              {formatINR(item.customer.lifetimeValue)}
            </strong>
            .
          </p>
        ) : null}
      </Question>

      {item.diagnosis ? (
        <Question question="What did it conclude?">
          <p>
            It classified the failure as{" "}
            <strong className="font-medium text-foreground">{diagnosis.label}</strong> with{" "}
            <strong className="font-medium text-foreground">
              {formatRatio(item.diagnosisConfidence)}
            </strong>{" "}
            confidence
            {item.recoverabilityProbability != null ? (
              <>
                , and put the chance of recovering this payment at{" "}
                <strong className="font-medium text-foreground">
                  {formatRatio(item.recoverabilityProbability)}
                </strong>
              </>
            ) : null}
            .
          </p>
          {item.llmReason ? (
            <p className="border-l-2 border-hairline pl-3 italic">{item.llmReason}</p>
          ) : null}
        </Question>
      ) : null}

      {item.recoveryScore != null ? (
        <Question question="Was it worth pursuing?">
          <p>
            The recovery opportunity scored{" "}
            <strong className="font-medium text-foreground">
              {Math.round(item.recoveryScore)} out of 100
            </strong>{" "}
            ({band.label.toLowerCase()}).
          </p>
          {canShowArithmetic ? (
            <>
              <p className="mono text-[12px] leading-5 text-foreground">
                {formatINR(item.payment.amount)} ×{" "}
                {formatRatio(item.recoverabilityProbability, 2)} →{" "}
                <span className="font-semibold">{formatINR(item.expectedRecoveryValue)}</span>{" "}
                <span className="font-sans text-muted-foreground">expected recovery value</span>
              </p>
              <p>
                The agent also charges the cost of the action itself against that figure, which is
                why the recorded value sits a little under the straight multiplication.
              </p>
            </>
          ) : null}
          {settings ? (
            <p>
              The merchant's floor for acting at all is{" "}
              {formatINR(settings.minimumRecoveryValue)}.
            </p>
          ) : null}
        </Question>
      ) : null}

      {item.policyDecision ? (
        <Question question="Was it allowed to act?">
          <p>
            The policy engine returned{" "}
            <strong className="font-medium text-foreground">{policy.label}</strong>
            {approved ? (
              <>
                {" "}
                and approved <strong className="font-medium text-foreground">
                  {actionLabel(approved).label.toLowerCase()}
                </strong>
              </>
            ) : null}
            .
          </p>
          {overruled && proposed ? (
            <p>
              The model had proposed{" "}
              <strong className="font-medium text-foreground">
                {actionLabel(proposed).label.toLowerCase()}
              </strong>
              . Policy has the final say, and it substituted a different action.
            </p>
          ) : null}
          {guardrail ? (
            <p>
              <span className="font-medium text-foreground">{guardrail.rule}.</span>{" "}
              {guardrail.detail}
            </p>
          ) : item.policyReason ? (
            <p>{item.policyReason}</p>
          ) : null}
        </Question>
      ) : null}

      {item.channel || item.outreachCount > 0 || item.retryCount > 0 ? (
        <Question question="What did it actually do?">
          <p>
            {item.outreachCount > 0
              ? `It contacted the customer ${item.outreachCount === 1 ? "once" : `${item.outreachCount} times`} over ${channelLabel(item.channel)}.`
              : item.retryCount > 0
                ? `It scheduled ${item.retryCount === 1 ? "one retry" : `${item.retryCount} retries`} and contacted nobody.`
                : "It took no action that reaches the customer."}
            {settings ? (
              <>
                {" "}
                Its ceiling is {settings.maxOutreachAttempts} outreach attempt
                {settings.maxOutreachAttempts === 1 ? "" : "s"} and {settings.maxRetryAttempts}{" "}
                retr{settings.maxRetryAttempts === 1 ? "y" : "ies"} per case.
              </>
            ) : null}
          </p>
          {item.recoveredAmount != null ? (
            <p>
              <strong className="font-medium text-pos">
                {formatINR(item.recoveredAmount)} was recovered.
              </strong>{" "}
              The payment is recorded as captured, which is what stopped further outreach.
            </p>
          ) : null}
        </Question>
      ) : null}
    </section>
  );
}

/** Compact variant for the live run, where vertical space is tight. */
export function WhyStrip({
  item,
  className,
}: {
  item: RecoveryCase;
  className?: string;
}) {
  if (!item.policyReason && !item.llmReason) return null;
  return (
    <div className={cn("space-y-2", className)}>
      <SectionLabel>Reasoning on record</SectionLabel>
      {item.llmReason ? (
        <p className="text-[13px] leading-[1.55] text-muted-foreground">
          <span className="font-medium text-foreground">Diagnosis: </span>
          {item.llmReason}
        </p>
      ) : null}
      {item.policyReason ? (
        <p className="text-[13px] leading-[1.55] text-muted-foreground">
          <span className="font-medium text-foreground">Policy: </span>
          {item.policyReason}
        </p>
      ) : null}
    </div>
  );
}
