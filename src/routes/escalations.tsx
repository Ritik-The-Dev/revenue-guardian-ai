/**
 * Escalations — the review queue.
 *
 * These are the cases the agent deliberately refused to handle on its own. The
 * page is written for the person who has to pick one up: what failed, what the
 * agent concluded, which rule stopped it, and how long it has been waiting.
 *
 * The list endpoint returns the case, its customer and its payment — so nothing
 * here claims to know about prior actions, which are only loaded on the case
 * itself.
 */

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, StopCircle } from "lucide-react";

import { AppLayout, PageBody, PageHeader } from "@/components/AppLayout";
import {
  EmptyState,
  ErrorState,
  Panel,
  Shimmer,
  StatusBadge,
} from "@/components/Primitives";
import { OriginTagFor } from "@/components/OriginTag";
import { ConfirmBar } from "@/components/ConfirmBar";
import { SecondaryButton } from "@/components/FormKit";
import { api, ApiError, type RecoveryCase } from "@/lib/api";
import { useNow } from "@/lib/useNow";
import {
  caseRef,
  diagnosisLabel,
  formatDuration,
  formatINR,
  formatRatio,
} from "@/lib/format";

export const Route = createFileRoute("/escalations")({
  component: EscalationsPage,
});

function EscalationCard({
  item,
  now,
  onStop,
  stopping,
}: {
  item: RecoveryCase;
  /** Current instant, supplied by the page so every card agrees on it. */
  now: number;
  onStop: () => void;
  stopping: boolean;
}) {
  const diagnosis = diagnosisLabel(item.diagnosis);

  return (
    <Panel className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/recovery/$id"
              params={{ id: item.id }}
              className="text-[14px] font-medium text-foreground underline-offset-2 hover:underline"
            >
              {item.customer?.name ?? item.customer?.email ?? "Unnamed customer"}
            </Link>
            <OriginTagFor paymentId={item.payment.razorpayPaymentId} hideLive />
            {item.diagnosis ? (
              <StatusBadge tone={diagnosis.tone} title={diagnosis.hint}>
                {diagnosis.label}
              </StatusBadge>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            <span className="mono">{caseRef(item.id)}</span>
            <span aria-hidden> · </span>
            waiting {formatDuration(now - new Date(item.updatedAt).getTime())}
            {item.customer?.email ? (
              <>
                <span aria-hidden> · </span>
                {item.customer.email}
              </>
            ) : null}
          </p>
        </div>
        <p className="shrink-0 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
          {formatINR(item.payment.amount)}
        </p>
      </div>

      <div className="space-y-3 px-4 py-3.5 sm:px-5">
        {item.escalationReason ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Why the agent stopped
            </p>
            <p className="mt-1 text-[13px] leading-5 text-foreground">{item.escalationReason}</p>
          </div>
        ) : item.policyReason ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Policy decision on record
            </p>
            <p className="mt-1 text-[13px] leading-5 text-foreground">{item.policyReason}</p>
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-hairline pt-3 sm:grid-cols-4">
          <div>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Failure
            </dt>
            <dd className="mt-0.5 text-[12.5px] leading-4 text-foreground">
              {item.payment.errorReason ?? item.payment.errorCode ?? "Not recorded"}
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Confidence
            </dt>
            <dd className="mt-0.5 text-[12.5px] leading-4 text-foreground">
              {formatRatio(item.diagnosisConfidence)}
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Recovery score
            </dt>
            <dd className="mt-0.5 text-[12.5px] leading-4 text-foreground">
              {item.recoveryScore != null ? `${Math.round(item.recoveryScore)}/100` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Contacted
            </dt>
            <dd className="mt-0.5 text-[12.5px] leading-4 text-foreground">
              {item.outreachCount === 0
                ? "Never"
                : `${item.outreachCount} time${item.outreachCount === 1 ? "" : "s"}`}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2 pt-0.5">
          <Link
            to="/recovery/$id"
            params={{ id: item.id }}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open the case
          </Link>
          <SecondaryButton size="sm" tone="neg" onClick={onStop} loading={stopping}>
            {!stopping ? <StopCircle className="size-3.5" aria-hidden /> : null}
            Stop recovery
          </SecondaryButton>
        </div>
      </div>
    </Panel>
  );
}

function EscalationsPage() {
  const qc = useQueryClient();
  const now = useNow(30_000);
  const [confirming, setConfirming] = useState<RecoveryCase | null>(null);
  const [error, setError] = useState<string | null>(null);

  const escalationsQuery = useQuery({
    queryKey: ["escalations", "list"],
    queryFn: () => api.recovery.list({ status: "ESCALATED", limit: 100 }),
    refetchInterval: 30_000,
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.recovery.stop(id, "Stopped by the merchant after review"),
    onSuccess: () => {
      setConfirming(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["escalations"] });
      void qc.invalidateQueries({ queryKey: ["cases"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "That case could not be stopped. Try again.");
    },
  });

  const cases = escalationsQuery.data?.cases ?? [];
  const total = escalationsQuery.data?.total ?? 0;
  const shownExposure = cases.reduce((sum, item) => sum + Number(item.payment.amount), 0);

  return (
    <AppLayout>
      <PageHeader
        title="Escalations"
        description="Cases the agent refused to handle automatically. It will send nothing further on these until a person decides."
        actions={
          cases.length > 0 ? (
            <div className="text-right">
              <p className="figure text-foreground">{formatINR(shownExposure)}</p>
              <p className="text-[11.5px] text-muted-foreground">
                outstanding across {cases.length} {cases.length === 1 ? "case" : "cases"}
                {total > cases.length ? ` of ${total}` : ""}
              </p>
            </div>
          ) : null
        }
      />

      <PageBody className="space-y-4">
        {confirming ? (
          <ConfirmBar
            title={`Stop recovery on ${confirming.customer?.name ?? caseRef(confirming.id)}?`}
            body={
              <>
                The case closes with {formatINR(confirming.payment.amount)} unrecovered and drops
                off this queue. The record stays intact. This cannot be undone from here.
              </>
            }
            confirmLabel="Stop recovery"
            cancelLabel="Leave it in the queue"
            busy={stopMutation.isPending}
            onConfirm={() => stopMutation.mutate(confirming.id)}
            onCancel={() => setConfirming(null)}
          />
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-neg-line bg-neg-soft px-4 py-2.5 text-[13px] text-neg"
          >
            {error}
          </p>
        ) : null}

        {escalationsQuery.isPending ? (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <Panel key={i} className="px-4 py-4 sm:px-5">
                <Shimmer className="h-4 w-48" />
                <Shimmer className="mt-3 h-3.5 w-full max-w-md" />
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[0, 1, 2, 3].map((j) => (
                    <Shimmer key={j} className="h-8" />
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        ) : escalationsQuery.isError ? (
          <Panel>
            <ErrorState
              title="Escalations are unavailable"
              description="The recovery service did not return the escalation queue."
              onRetry={() => void escalationsQuery.refetch()}
            />
          </Panel>
        ) : cases.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<ShieldCheck className="size-4" />}
              title="Nothing is waiting on a person"
              description="Every case is inside the bounds the agent is allowed to act within. Escalations appear here the moment policy refuses to automate one."
              action={
                <Link
                  to="/recovery"
                  className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium transition-colors hover:bg-accent"
                >
                  View all cases
                </Link>
              }
            />
          </Panel>
        ) : (
          <div className="space-y-4">
            {cases.map((item) => (
              <EscalationCard
                key={item.id}
                item={item}
                now={now}
                onStop={() => {
                  setError(null);
                  setConfirming(item);
                }}
                stopping={stopMutation.isPending && confirming?.id === item.id}
              />
            ))}
          </div>
        )}
      </PageBody>
    </AppLayout>
  );
}
