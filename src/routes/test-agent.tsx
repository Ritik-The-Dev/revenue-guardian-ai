/**
 * Test Agent — the judge-facing entry point.
 *
 * Left: describe a failed payment. Right: watch the agent handle it.
 *
 * The only synthetic thing in this flow is the originating failure event. The
 * diagnosis, the policy decision, the Razorpay payment link and the WhatsApp or
 * email message are all produced by the same code path the live webhook uses.
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

import { AppLayout, PageBody, PageHeader } from "@/components/AppLayout";
import { Panel, PanelHeader, StatusBadge } from "@/components/Primitives";
import { TestAgentForm } from "@/components/agent/TestAgentForm";
import { AgentRunView } from "@/components/agent/AgentRunView";
import { useSystemStatus } from "@/lib/useSystemStatus";
import type { TestAgentRunStarted } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/test-agent")({
  component: TestAgentPage,
});

/** Warns only about the things this specific flow depends on. */
function ReadinessNotice() {
  const { data } = useSystemStatus();
  if (!data) return null;

  const problems: string[] = [];
  if (!data.database) {
    problems.push("the database is not responding, so no case can be recorded");
  }
  if (!data.integrations.razorpay) {
    problems.push("Razorpay keys are not configured, so no payment link can be created");
  }
  if (!data.integrations.whatsapp && !data.integrations.email) {
    problems.push("neither WhatsApp nor email is configured, so no message can be delivered");
  }

  if (problems.length === 0) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border border-warn-line bg-warn-soft px-4 py-3"
    >
      <AlertTriangle className="mt-px size-4 shrink-0 text-warn" aria-hidden />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">
          The agent will still run, but part of the flow can't complete
        </p>
        <p className="mt-1 text-[12.5px] leading-5 text-foreground/80">
          Right now {problems.join("; ")}. The run will record honestly how far it got.
        </p>
      </div>
    </div>
  );
}

/** What is real and what is not, stated plainly before anything is sent. */
function HowThisWorks() {
  const { data } = useSystemStatus();

  return (
    <Panel>
      <PanelHeader
        title="How this works"
        description="Read this before you run it — a real message goes to a real number."
      />
      <div className="space-y-4 px-4 py-4 text-[13px] leading-[1.6] text-muted-foreground sm:px-5">
        <p>
          Submitting the form creates one synthetic failure event, carrying the same error code and
          reason Razorpay would send for the scenario you pick. From that point on nothing is
          simulated. The agent classifies the failure, scores how recoverable it is, checks the
          decision against your policy limits, creates a Razorpay payment link if it is allowed to,
          and sends the customer a message over WhatsApp — falling back to email if WhatsApp is
          unavailable.
        </p>
        <p>
          Every step on the right is read back out of the case's audit trail. If the backend did not
          record a step, this page does not show it as done.
        </p>

        <div className="space-y-2 border-t border-hairline pt-3.5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-foreground">
            Guardrails in force
          </p>
          <ul className="space-y-1.5">
            <li className="flex gap-2">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-idle" />
              Outreach is capped at{" "}
              <span className="font-medium text-foreground">
                {data ? data.limits.maxOutreachAttempts : "the configured number of"} messages
              </span>{" "}
              per case, and retries at{" "}
              <span className="font-medium text-foreground">
                {data ? data.limits.maxRetryAttempts : "the configured number of"} attempts
              </span>
              .
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-idle" />
              This page is separately rate limited, so one phone number or address cannot be used to
              send unlimited test messages.
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-idle" />
              Your consent is written to the audit trail before anything is sent, with the contact
              details masked.
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-idle" />
              Cases started here are tagged{" "}
              <StatusBadge tone="info" dot={false} className="align-baseline">
                Test run
              </StatusBadge>{" "}
              everywhere they appear, so they are never mistaken for merchant traffic.
            </li>
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function TestAgentPage() {
  const [current, setCurrent] = useState<TestAgentRunStarted | null>(null);
  const [history, setHistory] = useState<TestAgentRunStarted[]>([]);

  const start = (started: TestAgentRunStarted) => {
    setCurrent(started);
    setHistory((prev) => [started, ...prev.filter((r) => r.paymentId !== started.paymentId)].slice(0, 6));
  };

  return (
    <AppLayout>
      <PageHeader
        title="Test Agent"
        description="Give the agent a failed payment and watch it work. The failure is synthetic; the recovery is real."
        actions={<StatusBadge tone="info">Test mode</StatusBadge>}
      />

      <PageBody className="space-y-4">
        <ReadinessNotice />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)] xl:items-start">
          <div className="space-y-4">
            <TestAgentForm onStarted={start} runInFlight={current !== null} />

            {history.length > 0 ? (
              <Panel>
                <PanelHeader
                  title="Runs this session"
                  description="Switch back to any run you have already started."
                />
                <ul className="divide-y divide-hairline">
                  {history.map((run) => {
                    const active = current?.paymentId === run.paymentId;
                    return (
                      <li key={run.paymentId}>
                        <button
                          type="button"
                          onClick={() => setCurrent(run)}
                          aria-current={active ? "true" : undefined}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors sm:px-5",
                            active ? "bg-accent" : "hover:bg-accent/50",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-medium text-foreground">
                              {run.scenario.label}
                            </span>
                            <span className="mono block truncate text-[11px] text-muted-foreground">
                              {run.paymentId}
                            </span>
                          </span>
                          {active ? (
                            <StatusBadge tone="info" dot={false}>
                              Showing
                            </StatusBadge>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            ) : null}
          </div>

          <div className="min-w-0">
            {current ? (
              <AgentRunView
                key={current.paymentId}
                started={current}
                onReset={() => setCurrent(null)}
              />
            ) : (
              <HowThisWorks />
            )}
          </div>
        </div>
      </PageBody>
    </AppLayout>
  );
}
