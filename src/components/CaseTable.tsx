/**
 * Case table.
 *
 * The ledger view of recovery cases. Money is right-aligned and tabular so
 * columns of figures can be compared down the page; everything else is quiet.
 *
 * Below the `sm` breakpoint the same rows render as a stacked list, because a
 * seven-column table cannot be read on a phone.
 */

import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { RecoveryCase } from "@/lib/api";
import {
  caseRef,
  caseStatus,
  diagnosisLabel,
  formatINR,
  formatRelative,
  scoreBand,
} from "@/lib/format";
import { Shimmer, StatusBadge } from "./Primitives";
import { OriginTagFor } from "./OriginTag";

export type CaseTableDensity = "compact" | "full";

function customerName(item: RecoveryCase): string {
  return item.customer?.name ?? item.customer?.email ?? "Unnamed customer";
}

function failureLine(item: RecoveryCase): string {
  return item.payment.errorReason ?? item.payment.errorCode ?? "No failure reason recorded";
}

const TH = "px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";
const TD = "px-3 py-2.5 align-middle";

export function CaseTable({
  cases,
  density = "full",
  className,
}: {
  cases: RecoveryCase[];
  density?: CaseTableDensity;
  className?: string;
}) {
  const full = density === "full";

  return (
    <div className={cn("min-w-0", className)}>
      {/* ── Table, sm and up ─────────────────────────────────────────────── */}
      <div className="hidden overflow-x-auto scrollbar-thin sm:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={TH}>
                Case
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                Amount
              </th>
              {full ? (
                <th scope="col" className={TH}>
                  Diagnosis
                </th>
              ) : null}
              {full ? (
                <th scope="col" className={cn(TH, "text-right whitespace-nowrap")}>
                  Score
                </th>
              ) : null}
              <th scope="col" className={TH}>
                Status
              </th>
              {full ? (
                <th scope="col" className={cn(TH, "text-right whitespace-nowrap")}>
                  Updated
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {cases.map((item) => {
              const status = caseStatus(item.status);
              const diagnosis = diagnosisLabel(item.diagnosis);
              const band = scoreBand(item.recoveryScore);
              return (
                <tr
                  key={item.id}
                  className="border-b border-hairline transition-colors last:border-0 hover:bg-accent/45"
                >
                  <td className={cn(TD, "min-w-0")}>
                    <div className="flex items-center gap-2">
                      <Link
                        to="/recovery/$id"
                        params={{ id: item.id }}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {customerName(item)}
                      </Link>
                      <OriginTagFor paymentId={item.payment.razorpayPaymentId} hideLive />
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                      <span className="mono">{caseRef(item.id)}</span>
                      <span aria-hidden> · </span>
                      {failureLine(item)}
                    </p>
                  </td>

                  <td className={cn(TD, "text-right whitespace-nowrap font-medium")}>
                    {formatINR(item.payment.amount)}
                    {item.recoveredAmount != null && item.recoveredAmount > 0 ? (
                      <span className="mt-0.5 block text-[11px] font-normal text-pos">
                        {formatINR(item.recoveredAmount)} recovered
                      </span>
                    ) : null}
                  </td>

                  {full ? (
                    <td className={TD}>
                      {item.diagnosis ? (
                        <span title={diagnosis.hint} className="text-foreground">
                          {diagnosis.label}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ) : null}

                  {full ? (
                    <td className={cn(TD, "text-right whitespace-nowrap")}>
                      {item.recoveryScore != null ? (
                        <span title={`${band.label} recovery prospect`}>
                          <span className="tnum font-medium">{Math.round(item.recoveryScore)}</span>
                          <span className="text-muted-foreground">/100</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ) : null}

                  <td className={TD}>
                    <StatusBadge tone={status.tone} title={status.hint}>
                      {status.label}
                    </StatusBadge>
                  </td>

                  {full ? (
                    <td
                      className={cn(TD, "text-right whitespace-nowrap text-muted-foreground")}
                      title={new Date(item.updatedAt).toLocaleString("en-IN")}
                    >
                      {formatRelative(item.updatedAt)}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Stacked list, below sm ───────────────────────────────────────── */}
      <ul className="divide-y divide-hairline sm:hidden">
        {cases.map((item) => {
          const status = caseStatus(item.status);
          return (
            <li key={item.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      to="/recovery/$id"
                      params={{ id: item.id }}
                      className="truncate text-[13px] font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {customerName(item)}
                    </Link>
                    <OriginTagFor paymentId={item.payment.razorpayPaymentId} hideLive />
                  </div>
                  <p className="mono mt-0.5 text-[11px] text-muted-foreground">
                    {caseRef(item.id)}
                  </p>
                </div>
                <p className="shrink-0 text-[13px] font-semibold text-foreground">
                  {formatINR(item.payment.amount)}
                </p>
              </div>
              <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
                {failureLine(item)}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                <span className="text-[11px] text-muted-foreground">
                  {formatRelative(item.updatedAt)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CaseTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 px-4 py-3.5 sm:px-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Shimmer className="h-3.5 w-1/3" />
            <Shimmer className="h-3 w-1/2" />
          </div>
          <Shimmer className="h-3.5 w-16 shrink-0" />
          <Shimmer className="h-4 w-20 shrink-0 rounded-[4px]" />
        </div>
      ))}
    </div>
  );
}
