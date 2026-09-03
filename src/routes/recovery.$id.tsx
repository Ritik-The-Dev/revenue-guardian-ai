import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, StopCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { AppLayout } from "../components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { api, formatINR, scoreLabel, statusColor } from "../lib/api";

export const Route = createFileRoute("/recovery/$id")({
  component: CaseDetailPage,
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <span className="text-sm">{value ?? <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 grid grid-cols-2 md:grid-cols-3 gap-4">
        {children}
      </CardContent>
    </Card>
  );
}

function CaseDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: c, isLoading, isError } = useQuery({
    queryKey: ["recovery-case", id],
    queryFn: () => api.recovery.get(id),
    refetchInterval: 15_000,
  });

  const stopMutation = useMutation({
    mutationFn: () => api.recovery.stop(id, "Stopped by merchant via dashboard"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recovery-case", id] }),
  });

  const escalateMutation = useMutation({
    mutationFn: () => api.recovery.escalate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recovery-case", id] }),
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 text-sm text-muted-foreground">Loading case…</div>
      </AppLayout>
    );
  }

  if (isError || !c) {
    return (
      <AppLayout>
        <div className="p-6 text-sm text-red-500">Case not found or backend unreachable.</div>
      </AppLayout>
    );
  }

  const { label: scoreL, color: scoreC } = scoreLabel(Number(c.recoveryScore));
  const canStop = !["RECOVERED", "STOPPED"].includes(c.status);
  const canEscalate = !["RECOVERED", "ESCALATED", "STOPPED"].includes(c.status);

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/recovery">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">{c.customer?.name ?? "Unknown Customer"}</h1>
              <p className="text-sm text-muted-foreground">{c.customer?.email ?? c.id}</p>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusColor(c.status)}`}>
              {c.status.replace(/_/g, " ")}
            </span>
          </div>
          <div className="flex gap-2">
            {canEscalate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => escalateMutation.mutate()}
                disabled={escalateMutation.isPending}
                className="gap-1.5 text-yellow-700 border-yellow-300 hover:bg-yellow-50"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Escalate
              </Button>
            )}
            {canStop && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
              >
                <StopCircle className="h-3.5 w-3.5" /> Stop Recovery
              </Button>
            )}
          </div>
        </div>

        {/* Payment & Customer */}
        <Section title="Payment & Customer">
          <Field label="Payment ID" value={<span className="font-mono text-xs">{c.payment.razorpayPaymentId}</span>} />
          <Field label="Order ID" value={<span className="font-mono text-xs">{c.order?.razorpayOrderId ?? "—"}</span>} />
          <Field label="Amount" value={<span className="font-semibold">{formatINR(Number(c.payment.amount))}</span>} />
          <Field label="Method" value={c.payment.method} />
          <Field label="Error" value={c.payment.errorReason ?? c.payment.errorCode} />
          <Field label="Customer LTV" value={formatINR(Number(c.customer?.lifetimeValue))} />
          <Field label="Successful Payments" value={c.customer?.successfulPayments} />
          <Field label="Failed Payments" value={c.customer?.failedPayments} />
          <Field label="Comm. Preference" value={c.customer?.communicationPreference} />
        </Section>

        {/* AI Diagnosis */}
        <Section title="AI Diagnosis (Pollinations)">
          <Field label="Diagnosis" value={c.diagnosis?.replace(/_/g, " ")} />
          <Field label="Confidence" value={c.diagnosisConfidence != null ? `${(Number(c.diagnosisConfidence) * 100).toFixed(0)}%` : null} />
          <Field label="Recoverability" value={c.recoverabilityProbability != null ? `${(Number(c.recoverabilityProbability) * 100).toFixed(0)}%` : null} />
          <Field
            label="Recovery Score"
            value={
              c.recoveryScore != null
                ? <span className={`font-semibold ${scoreC}`}>{Math.round(Number(c.recoveryScore))} — {scoreL}</span>
                : null
            }
          />
          <Field label="Expected Recovery Value" value={formatINR(Number(c.expectedRecoveryValue))} />
          <Field label="AI Reason" value={<span className="text-xs italic">{c.llmReason}</span>} />
        </Section>

        {/* Policy Decision */}
        <Section title="Policy Decision">
          <Field label="Policy Decision" value={c.policyDecision} />
          <Field label="Policy Reason" value={c.policyReason} />
          <Field label="Recommended Action" value={c.recommendedAction?.replace(/_/g, " ")} />
          <Field label="Approved Action" value={<span className="font-semibold">{c.approvedAction?.replace(/_/g, " ")}</span>} />
          <Field label="Channel" value={c.channel} />
          <Field label="Retries" value={`${c.retryCount} / outreach ${c.outreachCount}`} />
          {c.escalationReason && <Field label="Escalation Reason" value={c.escalationReason} />}
          {c.stopReason && <Field label="Stop Reason" value={c.stopReason} />}
        </Section>

        {/* Payment Link */}
        {c.paymentLinkUrl && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payment Link</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <a
                href={c.paymentLinkUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                {c.paymentLinkUrl} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </CardContent>
          </Card>
        )}

        {/* Recovery result */}
        {c.recoveredAmount != null && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="px-5 py-4">
              <p className="text-sm font-semibold text-green-800">
                ✓ Recovered {formatINR(Number(c.recoveredAmount))}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        {c.actions && c.actions.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Actions Taken</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left px-5 py-2 font-medium">Action</th>
                    <th className="text-left px-5 py-2 font-medium">Channel</th>
                    <th className="text-left px-5 py-2 font-medium">Status</th>
                    <th className="text-left px-5 py-2 font-medium">Executed</th>
                    <th className="text-left px-5 py-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {c.actions.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="px-5 py-2.5">{a.action.replace(/_/g, " ")}</td>
                      <td className="px-5 py-2.5">{a.channel ?? "—"}</td>
                      <td className="px-5 py-2.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${a.status === "SENT" || a.status === "SUCCESS" ? "bg-green-100 text-green-800" : a.status === "FAILED" ? "bg-red-100 text-red-700" : a.status === "CANCELLED" ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-800"}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground">
                        {a.executedAt ? new Date(a.executedAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-xs text-red-500">{a.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Audit timeline */}
        {c.auditLogs && c.auditLogs.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Audit Timeline</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="relative border-l-2 border-border pl-5 space-y-4">
                {c.auditLogs.map((log) => (
                  <div key={log.id} className="relative">
                    <div className="absolute -left-[1.4rem] mt-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-sm font-medium">{log.eventType.replace(/_/g, " ")}</span>
                        {log.reason && <span className="text-sm text-muted-foreground"> — {log.reason}</span>}
                        {log.decision && (
                          <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">{log.decision}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
