import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { api, formatINR, scoreLabel, statusColor, type RecoveryCase } from "../lib/api";

export const Route = createFileRoute("/recovery")({
  component: RecoveryPage,
});

const STATUS_FILTERS = [
  "ALL", "ANALYZING", "WAITING_FOR_OUTCOME", "RETRY_PENDING",
  "RECOVERED", "ESCALATED", "STOPPED",
];

const CHANNEL_ICON: Record<string, string> = {
  WHATSAPP: "📱",
  EMAIL: "📧",
  NONE: "—",
};

function RecoveryPage() {
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["recovery-cases", status, page],
    queryFn: () =>
      api.recovery.list({
        status: status === "ALL" ? undefined : status,
        page,
        limit: 50,
      }),
    refetchInterval: 20_000,
  });

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Recovery Cases</h1>
            <p className="text-sm text-muted-foreground">
              {data?.total ?? 0} total cases
            </p>
          </div>
          <Link to="/">
            <Button variant="outline" size="sm">← Dashboard</Button>
          </Link>
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                status === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary"
              }`}
            >
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Cases</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {isLoading && (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
            )}
            {isError && (
              <div className="py-12 text-center text-sm text-red-500">Failed to load cases. Is the backend running?</div>
            )}
            {!isLoading && !isError && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Customer</th>
                    <th className="text-right px-4 py-3 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 font-medium">Failure</th>
                    <th className="text-left px-4 py-3 font-medium">Diagnosis</th>
                    <th className="text-right px-4 py-3 font-medium">Score</th>
                    <th className="text-right px-4 py-3 font-medium">ERV</th>
                    <th className="text-left px-4 py-3 font-medium">Action</th>
                    <th className="text-left px-4 py-3 font-medium">Ch.</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Recovered</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data?.cases.length === 0 && (
                    <tr>
                      <td colSpan={11} className="text-center py-10 text-muted-foreground">
                        No cases found. Run a batch simulation from the dashboard.
                      </td>
                    </tr>
                  )}
                  {data?.cases.map((c: RecoveryCase) => {
                    const { label, color } = scoreLabel(Number(c.recoveryScore));
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{c.customer?.name ?? "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{c.customer?.email ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{formatINR(Number(c.payment.amount))}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-30 truncate">
                          {c.payment.errorReason ?? c.payment.errorCode ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs">{c.diagnosis?.replace(/_/g, " ") ?? "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold text-xs ${color}`}>
                            {c.recoveryScore != null ? `${Math.round(Number(c.recoveryScore))} ${label}` : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{formatINR(Number(c.expectedRecoveryValue))}</td>
                        <td className="px-4 py-3 text-xs">{c.approvedAction?.replace(/_/g, " ") ?? "—"}</td>
                        <td className="px-4 py-3 text-center">{CHANNEL_ICON[c.channel ?? ""] ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(c.status)}`}>
                            {c.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {c.recoveredAmount != null ? formatINR(Number(c.recoveredAmount)) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to="/recovery/$id"
                            params={{ id: c.id }}
                            className="text-xs text-primary hover:underline"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
