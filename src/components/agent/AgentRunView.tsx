/**
 * Test Agent — live run view.
 *
 * Polls the backend for the run's real state and renders the stage timeline
 * derived from persisted audit rows. Nothing on this page advances on a timer:
 * if the backend has not recorded a step, the step is not shown as done.
 *
 * The elapsed clock is the one thing measured locally, and it is labelled as
 * elapsed time rather than as progress.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  RotateCcw,
} from "lucide-react";

import { api, type RecoveryCase, type TestAgentRunStarted } from "@/lib/api";
import {
  caseRef,
  caseStatus,
  formatDuration,
  formatINR,
  type Tone,
} from "@/lib/format";
import { currentStageLabel, deriveStages } from "@/lib/agentStages";
import { operatorText } from "@/lib/safeText";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  ErrorState,
  Panel,
  PanelHeader,
  SectionLabel,
  StatusBadge,
  StatusDot,
} from "@/components/Primitives";
import { PrimaryButton, SecondaryButton, Spinner } from "@/components/FormKit";
import { StageTimeline } from "@/components/StageTimeline";
import { WhyPanel } from "@/components/WhyPanel";
import { OriginTag } from "@/components/OriginTag";

// ── Outcome ──────────────────────────────────────────────────────────────────

interface Outcome {
  tone: Tone;
  title: string;
  body: string;
}

function outcomeOf(
  item: RecoveryCase | null,
  run: { state: string; error: string | null },
): Outcome | null {
  if (run.state === "FAILED") {
    return {
      tone: "neg",
      title: "The run did not complete",
      body: operatorText(
        run.error,
        "The recovery pipeline stopped before it finished. The steps below show how far it got.",
      ),
    };
  }

  if (!item) return null;

  switch (item.status) {
    case "RECOVERED":
      return {
        tone: "pos",
        title: "Payment recovered",
        body: `${formatINR(item.recoveredAmount ?? item.payment.amount)} is recorded as captured. Outreach has stopped for this case.`,
      };
    case "ESCALATED":
      return {
        tone: "neg",
        title: "Escalated to a person",
        body:
          item.escalationReason ??
          "Policy would not permit automatic recovery here, so the case was handed to a human queue.",
      };
    case "RETRY_PENDING":
      return {
        tone: "warn",
        title: "Retry scheduled",
        body:
          item.policyReason ??
          "The agent judged this failure transient and scheduled a bounded retry instead of contacting the customer.",
      };
    case "STOPPED":
      return {
        tone: "idle",
        title: "Recovery stopped",
        body: item.stopReason ?? "The agent stopped work on this case.",
      };
    case "WAITING_FOR_OUTCOME":
    case "ACTION_EXECUTED":
      return {
        tone: "info",
        title: "Waiting for the customer to pay",
        body: "The customer has been contacted. This case updates itself as soon as the payment is confirmed.",
      };
    default:
      return null;
  }
}

const BANNER: Record<Tone, string> = {
  pos: "border-pos-line bg-pos-soft",
  warn: "border-warn-line bg-warn-soft",
  neg: "border-neg-line bg-neg-soft",
  info: "border-info-line bg-info-soft",
  idle: "border-border bg-surface-2",
};

const BANNER_TEXT: Record<Tone, string> = {
  pos: "text-pos",
  warn: "text-warn",
  neg: "text-neg",
  info: "text-info",
  idle: "text-foreground",
};

// ── Payment link ─────────────────────────────────────────────────────────────

function PaymentLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked. The link is visible and selectable,
      // so there is nothing to recover from.
    }
  };

  return (
    <div className="rounded-md border border-info-line bg-info-soft/60 p-3">
      <p className="text-[12px] font-medium text-foreground">Razorpay payment link</p>
      <p className="mono mt-1.5 break-all text-[11.5px] leading-4 text-muted-foreground">{url}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Open the link
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
        <SecondaryButton size="sm" onClick={() => void copy()}>
          {copied ? (
            <>
              <Check className="size-3.5" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" aria-hidden />
              Copy link
            </>
          )}
        </SecondaryButton>
      </div>
    </div>
  );
}

// ── Elapsed clock ────────────────────────────────────────────────────────────

/**
 * Wall-clock duration of the run. Once the backend has recorded a finish time
 * the duration is that recorded interval — the clock stops where the server says
 * it stopped, rather than drifting on in the browser.
 */
function useElapsed(
  startedAt: string | null,
  finishedAt: string | null,
  live: boolean,
): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return null;

  if (finishedAt) {
    const end = new Date(finishedAt).getTime();
    if (Number.isFinite(end)) return Math.max(0, end - start);
  }

  return Math.max(0, now - start);
}

// ── Run view ─────────────────────────────────────────────────────────────────

export function AgentRunView({
  started,
  onReset,
}: {
  started: TestAgentRunStarted;
  onReset: () => void;
}) {
  const paymentId = started.paymentId;
  const [replayed, setReplayed] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["test-agent", "run", paymentId],
    queryFn: () => api.testAgent.state(paymentId),
    // A missing run is expected for the first moment after starting.
    retry: 3,
    retryDelay: 500,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 1000;
      if (data.run.state === "RUNNING") return 1200;
      const status = data.case?.status;
      // Keep watching while the outcome depends on the customer or the scheduler.
      if (status === "WAITING_FOR_OUTCOME" || status === "ACTION_EXECUTED") return 4000;
      if (status === "RETRY_PENDING") return 10_000;
      return false;
    },
  });

  const data = query.data ?? null;
  const item = data?.case ?? null;
  const runState = data?.run.state ?? "RUNNING";
  const pipelineRunning = runState === "RUNNING";

  const stages = useMemo(
    () => deriveStages(item, { run: data?.run ?? null }),
    [item, data?.run],
  );

  const waitingOnCustomer =
    item?.status === "WAITING_FOR_OUTCOME" || item?.status === "ACTION_EXECUTED";
  const elapsed = useElapsed(
    data?.run.startedAt ?? null,
    data?.run.finishedAt ?? null,
    pipelineRunning,
  );
  const outcome = data ? outcomeOf(item, data.run) : null;
  const status = caseStatus(item?.status);

  const activeStage = stages.find((s) => s.state === "ACTIVE");
  const expand = useMemo(() => {
    const ids = stages.filter((s) => s.state === "DONE" || s.state === "FAILED").map((s) => s.id);
    // Open the most recent completed stage so the newest evidence is visible
    // without a click, and keep the rest collapsed.
    return ids.length > 0 ? [ids[ids.length - 1] as string] : [];
  }, [stages]);

  const replayCapture = async () => {
    setReplaying(true);
    setReplayError(null);
    try {
      await api.demo.paymentCaptured(paymentId);
      setReplayed(true);
      await query.refetch();
    } catch {
      setReplayError("The capture event could not be replayed. The case is unchanged.");
    } finally {
      setReplaying(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Run header ───────────────────────────────────────────────────── */}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="eyebrow">Agent run</h2>
              <OriginTag origin="test" />
              {item ? (
                <StatusBadge tone={status.tone} title={status.hint}>
                  {status.label}
                </StatusBadge>
              ) : null}
            </div>
            <p className="mono mt-1.5 text-[11.5px] text-muted-foreground">{paymentId}</p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="inline-flex items-center gap-2 text-[12px] font-medium text-foreground">
              {pipelineRunning ? (
                <>
                  <Spinner className="text-info" />
                  {activeStage ? activeStage.waitingLabel : currentStageLabel(stages)}
                </>
              ) : (
                <>
                  <StatusDot
                    tone={runState === "FAILED" ? "neg" : waitingOnCustomer ? "info" : "pos"}
                    pulse={waitingOnCustomer}
                  />
                  {runState === "FAILED"
                    ? "Pipeline stopped"
                    : waitingOnCustomer
                      ? "Waiting on the customer"
                      : "Pipeline finished"}
                </>
              )}
            </span>
            {elapsed != null ? (
              <span className="mono tnum text-[11px] text-muted-foreground">
                {formatDuration(elapsed)} {data?.run.finishedAt ? "end to end" : "elapsed"}
              </span>
            ) : null}
          </div>
        </div>

        {/* Contact confirmation — masked, exactly as the backend recorded it. */}
        <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-[12px] sm:grid-cols-3 sm:px-5">
          <div>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Scenario
            </dt>
            <dd className="mt-0.5 text-foreground">{started.scenario.label}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              WhatsApp
            </dt>
            <dd className="mono mt-0.5 text-[11.5px] text-foreground">
              {started.contact.whatsapp ?? "Not provided"}
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Email
            </dt>
            <dd className="mono mt-0.5 text-[11.5px] break-all text-foreground">
              {started.contact.email ?? "Not provided"}
            </dd>
          </div>
        </dl>
      </Panel>

      {/* ── Outcome ──────────────────────────────────────────────────────── */}
      {outcome ? (
        <div
          className={cn("animate-fade-up rounded-lg border px-4 py-3.5 sm:px-5", BANNER[outcome.tone])}
          role={outcome.tone === "neg" ? "alert" : undefined}
        >
          <p className={cn("text-[13.5px] font-semibold", BANNER_TEXT[outcome.tone])}>
            {outcome.title}
          </p>
          <p className="mt-1 max-w-prose text-[13px] leading-5 text-foreground/80">
            {outcome.body}
          </p>

          {item?.paymentLinkUrl ? (
            <div className="mt-3">
              <PaymentLink url={item.paymentLinkUrl} />
            </div>
          ) : null}

          {waitingOnCustomer ? (
            <div className="mt-3 space-y-2 border-t border-hairline pt-3">
              <p className="text-[12.5px] leading-5 text-foreground/80">
                Pay the link with a Razorpay test card to finish the flow. When Razorpay sends the{" "}
                <span className="mono text-[11.5px]">payment_link.paid</span> webhook, this case
                becomes Recovered on its own.
              </p>
              <details className="group">
                <summary className="cursor-pointer text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground">
                  Razorpay can't reach this machine?
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-[11.5px] leading-4 text-muted-foreground">
                    Without a public webhook URL, Razorpay cannot notify this backend. The control
                    below replays the capture event locally so the rest of the flow can be
                    demonstrated. It marks the payment captured in this database only — it is not a
                    confirmation from Razorpay.
                  </p>
                  <SecondaryButton
                    size="sm"
                    onClick={() => void replayCapture()}
                    loading={replaying}
                    disabled={replayed}
                  >
                    {replayed ? "Capture event replayed" : "Replay capture locally"}
                  </SecondaryButton>
                  {replayError ? (
                    <p role="alert" className="text-[11.5px] text-neg">
                      {replayError}
                    </p>
                  ) : null}
                </div>
              </details>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Stage timeline ───────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          title="What the agent did"
          description="Read from the case's audit trail. A step with no recorded evidence is not marked complete."
          action={
            item ? (
              <Link
                to="/recovery/$id"
                params={{ id: item.id }}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-foreground transition-colors hover:text-brand"
              >
                {caseRef(item.id)}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            ) : null
          }
        />
        <div className="px-4 py-4 sm:px-5">
          {query.isError && !item ? (
            <ErrorState
              title="Can't read this run"
              description="The recovery service did not return the run's state. It may have restarted."
              onRetry={() => void query.refetch()}
            />
          ) : !data ? (
            <div className="flex items-center gap-2.5 py-6 text-[13px] text-muted-foreground">
              <Spinner />
              Starting the pipeline…
            </div>
          ) : (
            <StageTimeline stages={stages} expand={expand} />
          )}
        </div>
      </Panel>

      {/* ── Reasoning ────────────────────────────────────────────────────── */}
      {item && item.diagnosis ? (
        <div className="space-y-2">
          <SectionLabel>Why did the agent do this?</SectionLabel>
          <WhyPanel item={item} />
        </div>
      ) : null}

      {item == null && !query.isError && !pipelineRunning ? (
        <Panel>
          <EmptyState
            title="No case was recorded"
            description="The pipeline finished without writing a recovery case. Check the backend logs for this payment reference."
          />
        </Panel>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <PrimaryButton onClick={onReset}>
          <RotateCcw className="size-3.5" aria-hidden />
          Run another test
        </PrimaryButton>
        {item ? (
          <Link
            to="/recovery/$id"
            params={{ id: item.id }}
            className="text-[12.5px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Open the full case record
          </Link>
        ) : null}
      </div>
    </div>
  );
}
