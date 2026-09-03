/**
 * The audit rule.
 *
 * One structural device, used in two places: the live agent run on the Test
 * Agent page, and the decision trace on a case. A vertical rule with a
 * monospace timestamp gutter on its left and the recorded evidence on its
 * right — the shape of a ledger, because that is what this is.
 *
 * Every node reflects a real state derived in lib/agentStages. Nothing here
 * advances on a timer.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClockSeconds, TONE_TEXT, type Tone } from "@/lib/format";
import type { AgentStage, StageState } from "@/lib/agentStages";

const NODE_TONE: Record<Tone, string> = {
  pos: "border-pos bg-pos",
  warn: "border-warn bg-warn",
  neg: "border-neg bg-neg",
  info: "border-info bg-info",
  idle: "border-idle bg-idle",
};

function StageNode({ state, tone }: { state: StageState; tone: Tone }) {
  if (state === "ACTIVE") {
    return (
      <span className="relative flex size-[13px] items-center justify-center" aria-hidden>
        <span className="absolute size-[13px] animate-node-pulse rounded-full border border-info" />
        <span className="size-[7px] rounded-full bg-info" />
      </span>
    );
  }

  if (state === "DONE") {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-[13px] items-center justify-center rounded-full border",
          NODE_TONE[tone],
        )}
      >
        <svg viewBox="0 0 10 10" className="size-[9px] text-background" fill="none">
          <path
            d="M2 5.2 4 7.2 8 3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (state === "FAILED") {
    return (
      <span
        aria-hidden
        className="flex size-[13px] items-center justify-center rounded-full border border-neg bg-neg"
      >
        <svg viewBox="0 0 10 10" className="size-[8px] text-background" fill="none">
          <path
            d="M3 3l4 4M7 3l-4 4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  if (state === "SKIPPED") {
    return (
      <span
        aria-hidden
        className="flex size-[13px] items-center justify-center rounded-full border border-border bg-surface"
      >
        <span className="h-px w-[5px] bg-muted-foreground" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="size-[13px] rounded-full border border-dashed border-border bg-surface"
    />
  );
}

const STATE_WORD: Record<StageState, string> = {
  DONE: "Completed",
  ACTIVE: "In progress",
  PENDING: "Not started",
  SKIPPED: "Not applicable",
  FAILED: "Failed",
};

function StageRow({
  stage,
  isLast,
  defaultOpen,
}: {
  stage: AgentStage;
  isLast: boolean;
  defaultOpen: boolean;
}) {
  // The caller opens whichever stage last produced evidence, and that moves as
  // a live run advances. Follow it until the reader takes over, then respect
  // their choice for as long as the row is mounted.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? defaultOpen;
  const hasDetails = stage.details.length > 0;
  const dim = stage.state === "PENDING" || stage.state === "SKIPPED";

  return (
    <li
      className={cn("relative grid grid-cols-[54px_1fr] gap-x-3 sm:grid-cols-[64px_1fr] sm:gap-x-4")}
    >
      {/* Timestamp gutter — machine truth, monospaced, right-aligned to the rule. */}
      <div className="pt-[3px] text-right">
        <span
          className={cn(
            "mono text-[11px] leading-4",
            stage.at ? "text-muted-foreground" : "text-muted-foreground/45",
          )}
        >
          {stage.at ? formatClockSeconds(stage.at) : "··:··:··"}
        </span>
      </div>

      {/* The rule itself, with the node sitting on it. */}
      <div className="relative pb-5 pl-6">
        {!isLast ? (
          <span
            aria-hidden
            className={cn(
              "absolute left-[6px] top-[16px] bottom-[-2px] w-px",
              stage.state === "DONE" ? "bg-border" : "bg-hairline",
            )}
          />
        ) : null}
        <span className="absolute left-0 top-[2px]">
          <StageNode state={stage.state} tone={stage.tone} />
        </span>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3
            className={cn(
              "text-[13.5px] font-medium leading-5",
              dim ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {stage.title}
          </h3>
          {stage.state === "ACTIVE" ? (
            <span className="text-[11px] font-medium text-info">working…</span>
          ) : null}
          {stage.state === "FAILED" ? (
            <span className="text-[11px] font-medium text-neg">failed</span>
          ) : null}
          <span className="sr-only">{STATE_WORD[stage.state]}</span>
        </div>

        {stage.summary ? (
          <p
            className={cn(
              "mt-1 max-w-prose text-[13px] leading-5",
              stage.state === "FAILED" ? TONE_TEXT.neg : "text-muted-foreground",
            )}
          >
            {stage.summary}
          </p>
        ) : stage.state === "ACTIVE" ? (
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{stage.waitingLabel}</p>
        ) : null}

        {hasDetails ? (
          <>
            <button
              type="button"
              onClick={() => setOverride(!open)}
              aria-expanded={open}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown
                className={cn("size-3 transition-transform duration-200", open && "rotate-180")}
                aria-hidden
              />
              {open ? "Hide recorded values" : `Recorded values (${stage.details.length})`}
            </button>

            {open ? (
              <dl className="mt-2 grid gap-x-6 gap-y-1.5 rounded-md border border-hairline bg-surface-2 px-3 py-2.5 sm:grid-cols-2">
                {stage.details.map((detail) => (
                  <div key={detail.label} className="min-w-0">
                    <dt className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                      {detail.label}
                    </dt>
                    <dd
                      className={cn(
                        "mt-0.5 text-[12.5px] leading-4 break-words",
                        detail.mono && "mono text-[11.5px]",
                        detail.tone ? TONE_TEXT[detail.tone] : "text-foreground",
                      )}
                    >
                      {detail.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}

export function StageTimeline({
  stages,
  className,
  /** Open the detail block on these stages by default. */
  expand = [],
}: {
  stages: AgentStage[];
  className?: string;
  expand?: string[];
}) {
  return (
    <ol className={cn("stagger", className)}>
      {stages.map((stage, i) => (
        <StageRow
          key={stage.id}
          stage={stage}
          isLast={i === stages.length - 1}
          defaultOpen={expand.includes(stage.id)}
        />
      ))}
    </ol>
  );
}
