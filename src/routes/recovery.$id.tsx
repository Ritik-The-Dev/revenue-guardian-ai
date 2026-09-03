/**
 * Case detail — the agent's decision trace.
 *
 * This page exists to answer one question: can a person reconstruct exactly what
 * the agent did, and why, from what was recorded? The trace is the centrepiece;
 * the reasoning panel restates it in plain language; the raw audit rows are kept
 * available underneath so nothing is only available in summarised form.
 *
 * The two operator actions here are real state changes on the backend, so both
 * ask for confirmation and say plainly what they will do.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Copy,
  ExternalLink,
  StopCircle,
} from "lucide-react";

import { AppLayout, PageBody, PageHeader } from "@/components/AppLayout";
import {
  EmptyState,
  ErrorState,
  Field,
  Panel,
  PanelHeader,
  SectionLabel,
  Shimmer,
  StatusBadge,
} from "@/components/Primitives";
import { OriginTagFor } from "@/components/OriginTag";
import { StageTimeline } from "@/components/StageTimeline";
import { ConfirmBar } from "@/components/ConfirmBar";
import { WhyPanel } from "@/components/WhyPanel";
import { PrimaryButton, SecondaryButton } from "@/components/FormKit";
import { api, ApiError, type RecoveryCase } from "@/lib/api";
import { deriveStages } from "@/lib/agentStages";
import { deliveryFailureText } from "@/lib/safeText";
import {
  actionLabel,
  actionStatusLabel,
  auditEventLabel,
  caseRef,
  caseStatus,
  channelLabel,
  formatClockSeconds,
  formatDateTime,
  formatINR,
  formatRelative,
  humanise,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/recovery/$id")({
  component: CaseDetailPage,
});

type PendingAction = "stop" | "escalate";

const CONFIRM: Record<PendingAction, { title: string; body: string; confirm: string }> = {
  stop: {
    title: "Stop recovery on this case?",
    body: "The agent will send nothing further and schedule no more retries. The case stays on record with the reason. This cannot be undone from here.",
    confirm: "Stop recovery",
  },
  escalate: {
    title: "Hand this case to a person?",
    body: "The case moves to Escalations with a snapshot of what the agent knows. Automatic recovery stops. This cannot be undone from here.",
    confirm: "Escalate for review",
  },
};

// ── Small pieces ─────────────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      to="/recovery"
      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      All cases
    </Link>
  );
}

function PaymentLinkRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = () => {
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard permission denied — the URL is visible and selectable.
      });
  };

  return (
    <div className="space-y-2 px-4 py-3.5 sm:px-5">
      <p className="mono break-all rounded-md border border-hairline bg-surface-2 px-2.5 py-2 text-[11.5px] leading-4 text-foreground">
        {url}
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent"
        >
          Open the link
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
        <SecondaryButton size="sm" onClick={copy}>
          <Copy className="size-3.5" aria-hidden />
          {copied ? "Copied" : "Copy"}
        </SecondaryButton>
      </div>
      <p className="text-[11.5px] leading-4 text-muted-foreground">
        This is the live Razorpay link the customer received. Opening it does not change the case.
      </p>
    </div>
  );
}

/** Executed actions, as the backend recorded them — including failures. */
function ActionLog({ item }: { item: RecoveryCase }) {
  const actions = item.actions ?? [];
  if (actions.length === 0) {
    return (
      <p className="px-4 py-3.5 text-[13px] text-muted-foreground sm:px-5">
        No action has been executed on this case.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-hairline">
      {actions.map((action) => {
        const status = actionStatusLabel(action.status);
        return (
          <li key={action.id} className="px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-foreground">
                {actionLabel(action.action).label}
                {action.channel ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {channelLabel(action.channel)}
                  </span>
                ) : null}
              </p>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {action.executedAt
                ? `Executed ${formatDateTime(action.executedAt)}`
                : `Created ${formatDateTime(action.createdAt)} — not executed`}
              {action.providerMessageId ? (
                <>
                  <span aria-hidden> · </span>
                  <span className="mono">{action.providerMessageId}</span>
                </>
              ) : null}
            </p>
            {action.error ? (
              <p className="mt-1.5 rounded-md border border-neg-line bg-neg-soft px-2.5 py-1.5 text-[12px] leading-4 text-neg">
                {deliveryFailureText(action.error, action.channel)}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The unsummarised audit rows. Collapsed, because the trace above is derived
 *  from exactly these — but always available. */
function RawAuditTrail({ item }: { item: RecoveryCase }) {
  const logs = item.auditLogs ?? [];
  const [open, setOpen] = useState(false);
  if (logs.length === 0) return null;

  return (
    <Panel className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-accent/50 sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="eyebrow block">Raw audit trail</span>
          <span className="mt-1 block text-[13px] leading-5 text-muted-foreground">
            {logs.length} recorded {logs.length === 1 ? "event" : "events"}, exactly as stored.
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="overflow-x-auto scrollbar-thin border-t border-border">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-hairline">
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-5"
                >
                  Time
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                >
                  Event
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                >
                  Recorded reason
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-hairline last:border-0">
                  <td
                    className="mono whitespace-nowrap px-4 py-2 align-top text-[11px] text-muted-foreground sm:px-5"
                    title={formatDateTime(log.createdAt)}
                  >
                    {formatClockSeconds(log.createdAt)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="text-foreground">{auditEventLabel(log.eventType).label}</span>
                    {log.decision ? (
                      <span className="mono ml-1.5 rounded bg-surface-2 px-1 py-px text-[10.5px] text-muted-foreground">
                        {log.decision}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {log.reason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function CaseDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const caseQuery = useQuery({
    queryKey: ["cases", "detail", id],
    queryFn: () => api.recovery.get(id),
    // A case that is still in flight updates itself; a finished one stops.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return 5000;
      if (status === "WAITING_FOR_OUTCOME" || status === "ACTION_EXECUTED") return 8000;
      if (status === "ANALYZING" || status === "ACTION_PLANNED") return 3000;
      if (status === "RETRY_PENDING") return 20_000;
      return false;
    },
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: api.settings.get,
    staleTime: 5 * 60_000,
  });

  const item = caseQuery.data ?? null;

  const afterMutation = () => {
    setPending(null);
    setActionError(null);
    void qc.invalidateQueries({ queryKey: ["cases"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["escalations"] });
  };

  const onMutationError = (error: unknown) => {
    setActionError(
      error instanceof ApiError ? error.message : "That change could not be saved. Try again.",
    );
  };

  const stopMutation = useMutation({
    mutationFn: () => api.recovery.stop(id, "Stopped by the merchant from the case page"),
    onSuccess: afterMutation,
    onError: onMutationError,
  });

  const escalateMutation = useMutation({
    mutationFn: () => api.recovery.escalate(id),
    onSuccess: afterMutation,
    onError: onMutationError,
  });

  const stages = useMemo(() => (item ? deriveStages(item) : []), [item]);

  // Open the most recent step that has something recorded against it.
  const expand = useMemo(() => {
    const withDetail = stages.filter(
      (s) => s.details.length > 0 && (s.state === "DONE" || s.state === "FAILED"),
    );
    const last = withDetail[withDetail.length - 1];
    return last ? [last.id] : [];
  }, [stages]);

  if (caseQuery.isPending) {
    return (
      <AppLayout>
        <PageHeader title="Case" eyebrow={<BackLink />} />
        <PageBody className="space-y-4">
          <Panel className="px-4 py-5 sm:px-5">
            <Shimmer className="h-4 w-40" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4">
                  <Shimmer className="h-3.5 w-14 shrink-0" />
                  <Shimmer className="h-3.5 flex-1" />
                </div>
              ))}
            </div>
          </Panel>
        </PageBody>
      </AppLayout>
    );
  }

  if (caseQuery.isError || !item) {
    const notFound = caseQuery.error instanceof ApiError && caseQuery.error.status === 404;
    return (
      <AppLayout>
        <PageHeader title="Case" eyebrow={<BackLink />} />
        <PageBody>
          <Panel>
            {notFound ? (
              <EmptyState
                title="This case no longer exists"
                description="It may have been removed, or the link may be out of date."
                action={
                  <Link
                    to="/recovery"
                    className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium transition-colors hover:bg-accent"
                  >
                    Back to all cases
                  </Link>
                }
              />
            ) : (
              <ErrorState
                title="This case could not be loaded"
                description="The recovery service did not return the case."
                onRetry={() => void caseQuery.refetch()}
              />
            )}
          </Panel>
        </PageBody>
      </AppLayout>
    );
  }

  const status = caseStatus(item.status);
  const customer = item.customer;
  const closed = ["RECOVERED", "STOPPED"].includes(item.status);
  const canStop = !closed;
  const canEscalate = !closed && item.status !== "ESCALATED";
  const busy = stopMutation.isPending || escalateMutation.isPending;

  return (
    <AppLayout>
      <PageHeader
        title={customer?.name ?? "Unnamed customer"}
        eyebrow={<BackLink />}
        badges={
          <>
            <StatusBadge tone={status.tone} title={status.hint}>
              {status.label}
            </StatusBadge>
            <OriginTagFor paymentId={item.payment.razorpayPaymentId} />
          </>
        }
        description={`${caseRef(item.id)} · ${formatINR(item.payment.amount)} failed ${formatRelative(item.createdAt)}${
          customer?.email ? ` · ${customer.email}` : ""
        }`}
        actions={
          <>
            {canEscalate ? (
              <SecondaryButton
                size="sm"
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  setPending("escalate");
                }}
              >
                <AlertTriangle className="size-3.5" aria-hidden />
                Escalate
              </SecondaryButton>
            ) : null}
            {canStop ? (
              <SecondaryButton
                size="sm"
                tone="neg"
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  setPending("stop");
                }}
              >
                <StopCircle className="size-3.5" aria-hidden />
                Stop recovery
              </SecondaryButton>
            ) : null}
          </>
        }
      />

      <PageBody className="space-y-4">
        {/* Confirmation — destructive changes state what they do first. */}
        {pending ? (
          <ConfirmBar
            title={CONFIRM[pending].title}
            body={CONFIRM[pending].body}
            confirmLabel={CONFIRM[pending].confirm}
            cancelLabel="Keep the case as it is"
            busy={busy}
            onConfirm={() =>
              pending === "stop" ? stopMutation.mutate() : escalateMutation.mutate()
            }
            onCancel={() => setPending(null)}
          />
        ) : null}

        {actionError ? (
          <p
            role="alert"
            className="rounded-lg border border-neg-line bg-neg-soft px-4 py-2.5 text-[13px] text-neg"
          >
            {actionError}
          </p>
        ) : null}

        {/* Outcome, when there is one on record. */}
        {item.status === "RECOVERED" ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-pos-line bg-pos-soft px-4 py-3.5 sm:px-5">
            <p className="figure text-pos">
              {formatINR(item.recoveredAmount ?? item.payment.amount)}
            </p>
            <p className="text-[13px] leading-5 text-foreground/85">
              recovered — the payment is recorded as captured, which is what stopped further
              outreach.
            </p>
          </div>
        ) : item.status === "ESCALATED" && item.escalationReason ? (
          <div className="rounded-lg border border-neg-line bg-neg-soft px-4 py-3 sm:px-5">
            <p className="text-[13px] font-medium text-foreground">Waiting on a person</p>
            <p className="mt-1 text-[13px] leading-5 text-foreground/80">
              {item.escalationReason}
            </p>
          </div>
        ) : item.status === "STOPPED" && item.stopReason ? (
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 sm:px-5">
            <p className="text-[13px] font-medium text-foreground">Recovery stopped</p>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{item.stopReason}</p>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)] xl:items-start">
          {/* ── The trace ─────────────────────────────────────────────────── */}
          <div className="min-w-0 space-y-4">
            <Panel className="min-w-0">
              <PanelHeader
                title="Agent decision trace"
                description="Each step is read back out of this case's audit trail. A step with no recorded evidence is not marked complete."
                action={
                  caseQuery.isFetching ? (
                    <StatusBadge tone="idle">Refreshing</StatusBadge>
                  ) : null
                }
              />
              <div className="px-4 py-4 sm:px-5">
                <StageTimeline stages={stages} expand={expand} />
              </div>
            </Panel>

            <WhyPanel item={item} limits={settingsQuery.data ?? null} />

            <RawAuditTrail item={item} />
          </div>

          {/* ── The facts ─────────────────────────────────────────────────── */}
          <div className="min-w-0 space-y-4">
            <Panel className="min-w-0">
              <PanelHeader title="Payment" />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 px-4 py-3.5 sm:px-5">
                <Field label="Amount" value={formatINR(item.payment.amount)} />
                <Field
                  label="Status"
                  value={humanise(item.payment.status)}
                />
                <Field
                  label="Method"
                  value={item.payment.method ? item.payment.method.toUpperCase() : "—"}
                />
                <Field
                  label="Still due"
                  value={item.amountDue != null ? formatINR(item.amountDue) : "—"}
                  tone={item.amountDue != null && item.amountDue > 0 ? "warn" : undefined}
                />
                <Field
                  label="Payment ID"
                  value={item.payment.razorpayPaymentId}
                  mono
                  className="col-span-2"
                />
                {item.order?.razorpayOrderId ? (
                  <Field
                    label="Order ID"
                    value={item.order.razorpayOrderId}
                    mono
                    className="col-span-2"
                  />
                ) : null}
                <Field
                  label="Failure reported"
                  value={item.payment.errorReason ?? item.payment.errorCode ?? "Not recorded"}
                  tone="neg"
                  className="col-span-2"
                />
              </dl>
            </Panel>

            <Panel className="min-w-0">
              <PanelHeader title="Customer" />
              {customer ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 px-4 py-3.5 sm:px-5">
                  <Field label="Name" value={customer.name ?? "—"} className="col-span-2" />
                  <Field label="Successful payments" value={customer.successfulPayments} />
                  <Field label="Failed payments" value={customer.failedPayments} />
                  <Field label="Lifetime value" value={formatINR(customer.lifetimeValue)} />
                  <Field label="Prefers" value={channelLabel(customer.communicationPreference)} />
                  <Field label="Phone" value={customer.phone ?? "—"} mono className="col-span-2" />
                  <Field label="Email" value={customer.email ?? "—"} mono className="col-span-2" />
                </dl>
              ) : (
                <p className="px-4 py-3.5 text-[13px] text-muted-foreground sm:px-5">
                  No customer record was attached to this payment.
                </p>
              )}
            </Panel>

            {item.paymentLinkUrl ? (
              <Panel className="min-w-0">
                <PanelHeader
                  title="Payment link"
                  description={
                    item.razorpayPaymentLinkId
                      ? `Razorpay reference ${item.razorpayPaymentLinkId}`
                      : undefined
                  }
                />
                <PaymentLinkRow url={item.paymentLinkUrl} />
              </Panel>
            ) : null}

            <Panel className="min-w-0">
              <PanelHeader
                title="Actions executed"
                description={`${item.outreachCount} outreach · ${item.retryCount} ${item.retryCount === 1 ? "retry" : "retries"} used.`}
              />
              <ActionLog item={item} />
            </Panel>

            <div className="space-y-2">
              <SectionLabel>Record</SectionLabel>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Opened" value={formatDateTime(item.createdAt)} />
                <Field label="Last updated" value={formatDateTime(item.updatedAt)} />
              </dl>
            </div>
          </div>
        </div>
      </PageBody>
    </AppLayout>
  );
}
