/**
 * Where cases end up.
 *
 * Three case counts the backend already reports, drawn to scale against the
 * total. The percentages are computed from those counts; no stage is padded to
 * make the shape look better, and a zero stage renders as zero.
 *
 * "Actions taken" is deliberately kept out of the bars and shown on its own
 * line: the backend counts it per action, not per case, so one case with three
 * outreach attempts contributes three. Dividing it by the case total would
 * produce a share above 100% and a claim the data does not support.
 */

import { cn } from "@/lib/utils";
import type { DashboardMetrics } from "@/lib/api";
import { type Tone } from "@/lib/format";
import { EmptyState } from "./Primitives";

interface Step {
  label: string;
  hint: string;
  value: number;
  tone: Tone;
}

const FILL: Record<Tone, string> = {
  pos: "bg-pos",
  warn: "bg-warn",
  neg: "bg-neg",
  info: "bg-info",
  idle: "bg-idle",
};

export function RecoveryFunnel({
  metrics,
  className,
}: {
  metrics: DashboardMetrics;
  className?: string;
}) {
  const total = metrics.casesEvaluated;

  const steps: Step[] = [
    {
      label: "Failures received",
      hint: "Every failed payment on record",
      value: total,
      tone: "idle",
    },
    {
      label: "Payments recovered",
      hint: "Cases where the payment is recorded as captured",
      value: metrics.successfulRecoveries,
      tone: "pos",
    },
    {
      label: "Sent to a person",
      hint: "Cases policy refused to automate",
      value: metrics.escalations,
      tone: "neg",
    },
  ];

  if (total === 0) {
    return (
      <EmptyState
        title="No failures on record yet"
        description="This fills in as the agent receives failed payments. Run the Test Agent to see one move through end to end."
      />
    );
  }

  return (
    <div className={cn("space-y-3.5 px-4 py-4 sm:px-5", className)}>
      {steps.map((step, i) => {
        const share = (step.value / total) * 100;
        return (
          <div key={step.label}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[12.5px] font-medium text-foreground" title={step.hint}>
                {step.label}
              </p>
              <p className="tnum shrink-0 text-[12.5px] text-muted-foreground">
                <span className="font-semibold text-foreground">{step.value}</span>
                {i > 0 ? <span className="ml-1.5 text-[11.5px]">{share.toFixed(0)}%</span> : null}
              </p>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-[3px] bg-surface-2">
              <div
                className={cn("h-full origin-left rounded-[3px] animate-bar-grow", FILL[step.tone])}
                style={{ width: `${share}%`, animationDelay: `${i * 70}ms` }}
              />
            </div>
          </div>
        );
      })}

      <div className="flex items-baseline justify-between gap-3 border-t border-hairline pt-3">
        <p className="text-[12.5px] font-medium text-foreground">Actions taken</p>
        <p className="tnum shrink-0 text-[12.5px] font-semibold text-foreground">
          {metrics.interventions}
        </p>
      </div>
      <p className="text-[11.5px] leading-4 text-muted-foreground">
        The first three rows count cases, and the shares are of all failures received. Actions are
        counted individually, so a case contacted twice contributes two — which is why it sits
        outside the bars.
      </p>
    </div>
  );
}
