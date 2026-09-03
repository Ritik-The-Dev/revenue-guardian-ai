import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, DollarSign, ShieldAlert,
  CheckCircle2, Activity, Zap, RefreshCw, Play
} from "lucide-react";
import { AppLayout } from "../components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { api, formatINR, statusColor } from "../lib/api";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function StatCard({
  title, value, sub, icon: Icon, highlight,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  highlight?: "green" | "red" | "blue";
}) {
  const color =
    highlight === "green"
      ? "text-green-600"
      : highlight === "red"
        ? "text-red-500"
        : "text-primary";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const qc = useQueryClient();

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: api.dashboard.metrics,
    refetchInterval: 30_000,
  });

  const { data: activityData } = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: api.dashboard.activity,
    refetchInterval: 30_000,
  });

  const { data: casesData } = useQuery({
    queryKey: ["recovery-cases-recent"],
    queryFn: () => api.recovery.list({ limit: 10 }),
    refetchInterval: 30_000,
  });

  const batchMutation = useMutation({
    mutationFn: () => api.demo.generateBatch(100),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      qc.invalidateQueries({ queryKey: ["recovery-cases-recent"] });
      qc.invalidateQueries({ queryKey: ["dashboard-activity"] });
    },
  });

  const recoveryRate = metrics ? (metrics.recoveryRate * 100).toFixed(1) : "—";

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">AI-powered payment recovery overview</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => qc.invalidateQueries()}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => batchMutation.mutate()}
              disabled={batchMutation.isPending}
              className="gap-1.5"
            >
              <Play className="h-3.5 w-3.5" />
              {batchMutation.isPending ? "Generating…" : "Run Batch Simulation"}
            </Button>
          </div>
        </div>

        {batchMutation.data && (
          <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            Batch complete — {batchMutation.data.generated} cases generated
            {batchMutation.data.failed > 0 && `, ${batchMutation.data.failed} failed`}
          </div>
        )}

        {/* KPI cards */}
        {metricsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Card key={i}><CardContent className="h-24 animate-pulse bg-muted rounded-md mt-4" /></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Revenue at Risk" value={formatINR(metrics?.revenueAtRisk)} icon={TrendingDown} highlight="red" />
            <StatCard title="Revenue Recovered" value={formatINR(metrics?.revenueRecovered)} icon={DollarSign} highlight="green" />
            <StatCard title="Recovery Rate" value={`${recoveryRate}%`} icon={TrendingUp} highlight="blue" />
            <StatCard title="Cases Evaluated" value={String(metrics?.casesEvaluated ?? 0)} icon={Activity} />
            <StatCard title="Interventions" value={String(metrics?.interventions ?? 0)} icon={Zap} />
            <StatCard title="Successful Recoveries" value={String(metrics?.successfulRecoveries ?? 0)} icon={CheckCircle2} highlight="green" />
            <StatCard title="Escalations" value={String(metrics?.escalations ?? 0)} icon={ShieldAlert} highlight="red" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent cases */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold">Recent Cases</CardTitle>
              <Link to="/recovery" className="text-xs text-primary hover:underline">View all →</Link>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left px-4 py-2 font-medium">Customer</th>
                    <th className="text-right px-4 py-2 font-medium">Amount</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {casesData?.cases.length === 0 && (
                    <tr><td colSpan={3} className="text-center py-6 text-muted-foreground">No cases yet — run a batch simulation</td></tr>
                  )}
                  {casesData?.cases.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link to="/recovery/$id" params={{ id: c.id }} className="hover:underline font-medium">
                          {c.customer?.name ?? c.customer?.email ?? "Unknown"}
                        </Link>
                        <div className="text-xs text-muted-foreground">{c.payment.errorReason ?? "—"}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatINR(Number(c.payment.amount))}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(c.status)}`}>
                          {c.status.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Activity feed */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Activity Feed</CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-80 overflow-y-auto">
              {activityData?.activity.length === 0 && (
                <p className="text-center py-6 text-sm text-muted-foreground">No activity yet</p>
              )}
              {activityData?.activity.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3 border-b last:border-0 text-sm">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{item.eventType.replace(/_/g, " ")}</span>
                    {item.reason && (
                      <span className="text-muted-foreground"> — {item.reason}</span>
                    )}
                    {item.case?.customer?.name && (
                      <div className="text-xs text-muted-foreground truncate">{item.case.customer.name}</div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
