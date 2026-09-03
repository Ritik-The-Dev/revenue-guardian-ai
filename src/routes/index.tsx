/**
 * Overview.
 *
 * The merchant's answer to one question: what did the agent do with the money
 * that failed today. Every figure comes from GET /api/dashboard/metrics; nothing
 * is projected, extrapolated or padded, and a zero renders as a zero.
 *
 * Where the underlying rows came from — real webhooks, Test Agent runs, or
 * generated evaluation data — is stated plainly, because those figures should
 * never be read as merchant traffic without qualification.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowUpRight, FlaskConical, RefreshCw, CreditCard } from "lucide-react";

import { AppLayout, PageBody, PageHeader } from "@/components/AppLayout";
import {
  EmptyState,
  ErrorState,
  Panel,
  PanelHeader,
  Shimmer,
} from "@/components/Primitives";
import { AnimatedNumber, MetricTile } from "@/components/Metrics";
import { ActivityFeed, ActivityFeedSkeleton } from "@/components/ActivityFeed";
import { RecoveryFunnel } from "@/components/RecoveryFunnel";
import { CaseTable, CaseTableSkeleton } from "@/components/CaseTable";
import { SecondaryButton } from "@/components/FormKit";
import { api } from "@/lib/api";
import { formatAmount, formatPercent, ORIGIN_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: OverviewPage,
});

// ── Money band ───────────────────────────────────────────────────────────────

function MoneyFigure({
  label,
  amount,
  hint,
  tone,
  loading,
}: {
  label: string;
  amount: number;
  hint: string;
  tone: "neg" | "pos" | "info";
  loading: boolean;
}) {
  return (
    <div className="px-4 py-4 sm:px-5 sm:py-5">
      <p className="eyebrow">{label}</p>
      {loading ? (
        <Shimmer className="mt-2.5 h-9 w-40" />
      ) : (
        <p
          className={cn(
            "figure-xl mt-2",
            tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : "text-foreground",
          )}
        >
          <span className="mr-0.5 text-[0.62em] font-medium align-[0.12em] text-muted-foreground">
            ₹
          </span>
          <AnimatedNumber value={amount} format={formatAmount} />
        </p>
      )}
      <p className="mt-1.5 max-w-[36ch] text-[12px] leading-4 text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Real counts per origin, from the cases list filter. */
function DataMix() {
  const live = useQuery({
    queryKey: ["cases", "count", "live"],
    queryFn: () => api.recovery.list({ source: "live", limit: 1 }),
    staleTime: 30_000,
  });
  const test = useQuery({
    queryKey: ["cases", "count", "test"],
    queryFn: () => api.recovery.list({ source: "test", limit: 1 }),
    staleTime: 30_000,
  });
  const synthetic = useQuery({
    queryKey: ["cases", "count", "synthetic"],
    queryFn: () => api.recovery.list({ source: "synthetic", limit: 1 }),
    staleTime: 30_000,
  });

  const rows = [
    { origin: "live" as const, total: live.data?.total, dot: "bg-pos" },
    { origin: "test" as const, total: test.data?.total, dot: "bg-info" },
    { origin: "synthetic" as const, total: synthetic.data?.total, dot: "bg-idle" },
  ];

  const anyLoaded = rows.some((r) => r.total != null);
  if (!anyLoaded) return null;

  const syntheticCount = synthetic.data?.total ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-4 py-2.5 sm:px-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Cases counted above
      </p>
      {rows.map((row) => (
        <span
          key={row.origin}
          title={ORIGIN_LABEL[row.origin].hint}
          className="inline-flex items-baseline gap-1.5 text-[12px] text-muted-foreground"
        >
          <span aria-hidden className={cn("mb-px size-1.5 shrink-0 rounded-full", row.dot)} />
          {ORIGIN_LABEL[row.origin].label}
          <span className="tnum font-semibold text-foreground">
            {row.total != null ? row.total : "—"}
          </span>
        </span>
      ))}
      {syntheticCount > 0 ? (
        <p className="text-[11.5px] leading-4 text-muted-foreground">
          Totals include generated evaluation data, so they are not merchant revenue.
        </p>
      ) : null}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function OverviewPage() {
  const qc = useQueryClient();

  const metricsQuery = useQuery({
    queryKey: ["dashboard", "metrics"],
    queryFn: api.dashboard.metrics,
    refetchInterval: 30_000,
  });

  const activityQuery = useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: api.dashboard.activity,
    refetchInterval: 20_000,
  });

  const casesQuery = useQuery({
    queryKey: ["dashboard", "recent-cases"],
    queryFn: () => api.recovery.list({ limit: 8 }),
    refetchInterval: 30_000,
  });

  // ── Real Razorpay Checkout ───────────────────────────────────────────────
  // Creates a real test-mode Razorpay order and opens the checkout modal.
  // Use failure@razorpay as UPI ID → triggers a real payment.failed webhook
  // → existing recovery pipeline runs automatically. No demo endpoint is called.
  const checkoutMutation = useMutation({
    mutationFn: () =>
      api.testAgent.createCheckoutOrder({ amount: 4999, currency: "INR" }),
    onSuccess: (order) => {
      const open = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rzp = new (window as any).Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: "Revenue Guardian — Real Failure Test",
          description: "Enter failure@razorpay as UPI ID to trigger a real payment.failed webhook",
          theme: { color: "#1a1a1a" },
          modal: { escape: true },
        });
        rzp.open();
      };
      if ((window as Record<string, unknown>)["Razorpay"]) {
        open();
      } else {
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = open;
        document.body.appendChild(s);
      }
    },
  });

  const metrics = metricsQuery.data;
  const loading = metricsQuery.isPending;
  const cases = casesQuery.data?.cases ?? [];

  return (
    <AppLayout>
      <PageHeader
        title="Overview"
        description="What the recovery agent has done with failed payments, and what it is waiting on."
        actions={
          <>
            <SecondaryButton
              size="sm"
              onClick={() => void qc.invalidateQueries()}
              loading={metricsQuery.isFetching && !metricsQuery.isPending}
            >
              {!(metricsQuery.isFetching && !metricsQuery.isPending) ? (
                <RefreshCw className="size-3.5" aria-hidden />
              ) : null}
              Refresh
            </SecondaryButton>
            <SecondaryButton
              size="sm"
              onClick={() => checkoutMutation.mutate()}
              loading={checkoutMutation.isPending}
              title="Open real Razorpay checkout — enter failure@razorpay as UPI ID to trigger a real payment.failed webhook"
            >
              {!checkoutMutation.isPending ? <CreditCard className="size-3.5" aria-hidden /> : null}
              {checkoutMutation.isPending ? "Creating order…" : "Real checkout"}
            </SecondaryButton>
            <Link
              to="/test-agent"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <FlaskConical className="size-3.5" aria-hidden />
              Test the agent
            </Link>
          </>
        }
      />

      <PageBody className="space-y-4">
        {/* ── Money ──────────────────────────────────────────────────────── */}
        {metricsQuery.isError ? (
          <Panel>
            <ErrorState
              title="Metrics are unavailable"
              description="The recovery service did not return dashboard figures. Nothing is shown rather than an estimate."
              onRetry={() => void metricsQuery.refetch()}
            />
          </Panel>
        ) : (
          <Panel>
            <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <MoneyFigure
                label="Revenue at risk"
                amount={metrics?.revenueAtRisk ?? 0}
                hint="Outstanding on failed payments the agent is still working on."
                tone="neg"
                loading={loading}
              />
              <MoneyFigure
                label="Revenue recovered"
                amount={metrics?.revenueRecovered ?? 0}
                hint="Recorded as captured after the agent intervened."
                tone="pos"
                loading={loading}
              />
              <div className="px-4 py-4 sm:px-5 sm:py-5">
                <p className="eyebrow">Recovery rate by value</p>
                {loading ? (
                  <Shimmer className="mt-2.5 h-9 w-28" />
                ) : (
                  <p className="figure-xl mt-2 text-foreground">
                    <AnimatedNumber
                      value={(metrics?.recoveryRate ?? 0) * 100}
                      format={(n) => formatPercent(n, 1)}
                    />
                  </p>
                )}
                <p className="mt-1.5 max-w-[36ch] text-[12px] leading-4 text-muted-foreground">
                  Recovered value as a share of recovered plus still-outstanding value. Stopped
                  cases are excluded from both.
                </p>
              </div>
            </div>
            <DataMix />
          </Panel>
        )}

        {/* ── Counts ─────────────────────────────────────────────────────── */}
        <Panel>
          <div className="grid divide-y divide-hairline sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
            <MetricTile
              label="Failures received"
              value={formatAmount(metrics?.casesEvaluated ?? 0)}
              hint="Every case on record"
              loading={loading}
            />
            <MetricTile
              label="Actions taken"
              value={formatAmount(metrics?.interventions ?? 0)}
              hint="Counted per action, not per case"
              tone="info"
              loading={loading}
            />
            <MetricTile
              label="Payments recovered"
              value={formatAmount(metrics?.successfulRecoveries ?? 0)}
              hint="Recorded as captured"
              tone="pos"
              loading={loading}
            />
            <MetricTile
              label="Sent to a person"
              value={formatAmount(metrics?.escalations ?? 0)}
              hint="Policy refused to automate"
              tone="neg"
              loading={loading}
            />
          </div>
        </Panel>

        {/* ── Funnel + activity ──────────────────────────────────────────── */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel className="min-w-0">
            <PanelHeader
              title="Where cases end up"
              description="Case counts drawn to scale against every failure received."
            />
            {loading ? (
              <div className="space-y-4 px-4 py-4 sm:px-5">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <Shimmer className="h-3.5 w-1/3" />
                    <Shimmer className="h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : metrics ? (
              <RecoveryFunnel metrics={metrics} />
            ) : null}
          </Panel>

          <Panel className="min-w-0">
            <PanelHeader
              title="Latest activity"
              description="The agent's audit trail, newest first."
            />
            <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
              {activityQuery.isPending ? (
                <ActivityFeedSkeleton />
              ) : activityQuery.isError ? (
                <ErrorState
                  title="Activity is unavailable"
                  onRetry={() => void activityQuery.refetch()}
                />
              ) : (
                <ActivityFeed items={activityQuery.data?.activity ?? []} />
              )}
            </div>
          </Panel>
        </div>

        {/* ── Recent cases ───────────────────────────────────────────────── */}
        <Panel className="min-w-0">
          <PanelHeader
            title="Recent cases"
            description="The eight most recently updated recovery cases."
            action={
              <Link
                to="/recovery"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-foreground transition-colors hover:text-brand"
              >
                All cases
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {casesQuery.isPending ? (
            <CaseTableSkeleton rows={5} />
          ) : casesQuery.isError ? (
            <ErrorState
              title="Cases are unavailable"
              onRetry={() => void casesQuery.refetch()}
            />
          ) : cases.length === 0 ? (
            <EmptyState
              title="No recovery cases yet"
              description="A case is opened the moment a payment fails. Run the Test Agent to watch one move through the whole pipeline."
              action={
                <Link
                  to="/test-agent"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <FlaskConical className="size-3.5" aria-hidden />
                  Test the agent
                </Link>
              }
            />
          ) : (
            <CaseTable cases={cases} density="compact" />
          )}
        </Panel>
      </PageBody>
    </AppLayout>
  );
}
