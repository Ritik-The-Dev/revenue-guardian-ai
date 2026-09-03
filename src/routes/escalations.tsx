import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, StopCircle } from "lucide-react";
import { AppLayout } from "../components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { api, formatINR, statusColor } from "../lib/api";

export const Route = createFileRoute("/escalations")({
  component: EscalationsPage,
});

function EscalationsPage() {
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["escalated-cases"],
    queryFn: () => api.recovery.list({ status: "ESCALATED", limit: 100 }),
    refetchInterval: 20_000,
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.recovery.stop(id, "Stopped by merchant after review"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["escalated-cases"] }),
  });

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-red-500" />
          <div>
            <h1 className="text-2xl font-bold">Escalations</h1>
            <p className="text-sm text-muted-foreground">
              Cases requiring human review — no automatic action will be taken
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading escalated cases…</div>
        )}
        {isError && (
          <div className="text-sm text-red-500 py-8 text-center">Failed to load. Is the backend running?</div>
        )}

        {!isLoading && !isError && data?.cases.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No escalated cases</p>
              <p className="text-sm mt-1">All cases are within automated recovery bounds.</p>
            </CardContent>
          </Card>
        )}

        {data?.cases.map((c) => (
          <Card key={c.id} className="border-red-100">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base">{c.customer?.name ?? "Unknown Customer"}</CardTitle>
                  <p className="text-sm text-muted-foreground">{c.customer?.email ?? "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(c.status)}`}>
                    {c.status}
                  </span>
                  <span className="text-lg font-bold">{formatINR(Number(c.payment.amount))}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {/* Escalation details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Failure</p>
                  <p>{c.payment.errorReason ?? c.payment.errorCode ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Diagnosis</p>
                  <p>{c.diagnosis?.replace(/_/g, " ") ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Confidence</p>
                  <p>{c.diagnosisConfidence != null ? `${(Number(c.diagnosisConfidence) * 100).toFixed(0)}%` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Prior Actions</p>
                  <p>{c.actions?.length ?? 0}</p>
                </div>
              </div>

              {c.escalationReason && (
                <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800">
                  <span className="font-medium">Escalation reason: </span>{c.escalationReason}
                </div>
              )}

              {c.escalation?.recommendedNextStep && (
                <div className="rounded-md bg-yellow-50 border border-yellow-100 px-3 py-2 text-sm text-yellow-800">
                  <span className="font-medium">Recommended next step: </span>{c.escalation.recommendedNextStep}
                </div>
              )}

              {/* Actions taken before escalation */}
              {c.actions && c.actions.length > 0 && (
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground font-medium mb-1.5">Prior actions</p>
                  <div className="flex flex-wrap gap-2">
                    {c.actions.map((a) => (
                      <span key={a.id} className="text-xs px-2 py-0.5 rounded bg-muted">
                        {a.action.replace(/_/g, " ")} — {a.status}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Link to="/recovery/$id" params={{ id: c.id }}>
                  <Button variant="outline" size="sm">View Full Details</Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => stopMutation.mutate(c.id)}
                  disabled={stopMutation.isPending}
                  className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
                >
                  <StopCircle className="h-3.5 w-3.5" /> Stop Case
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}
