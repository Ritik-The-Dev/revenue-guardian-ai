/**
 * Activity feed.
 *
 * The same audit-rule device as the decision trace, at a lower resolution:
 * a monospace time gutter, a hairline, and one line per recorded event. Every
 * row is an audit row the backend wrote.
 */

import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/lib/api";
import {
  auditEventLabel,
  caseRef,
  formatClock,
  formatINR,
  formatRelative,
  TONE_DOT,
} from "@/lib/format";
import { EmptyState, Shimmer } from "./Primitives";

export function ActivityFeed({
  items,
  className,
}: {
  items: ActivityItem[];
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No agent activity yet"
        description="Events appear here as the agent receives failed payments and acts on them. Run the Test Agent to produce the first one."
      />
    );
  }

  return (
    <ol className={cn("stagger py-1", className)}>
      {items.map((item, i) => {
        const spec = auditEventLabel(item.eventType);
        const amount = item.case?.payment?.amount;
        const name = item.case?.customer?.name ?? item.case?.customer?.email ?? null;
        const isLast = i === items.length - 1;

        return (
          <li key={item.id} className="grid grid-cols-[46px_1fr] gap-x-3 sm:grid-cols-[54px_1fr]">
            <div className="pt-[9px] text-right">
              <span
                className="mono text-[11px] leading-4 text-muted-foreground"
                title={formatRelative(item.createdAt)}
              >
                {formatClock(item.createdAt)}
              </span>
            </div>

            <div className="relative pl-5">
              {!isLast ? (
                <span
                  aria-hidden
                  className="absolute left-[3px] top-[17px] bottom-0 w-px bg-hairline"
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-[11px] size-[7px] rounded-full",
                  TONE_DOT[spec.tone],
                )}
              />

              <div className="border-b border-hairline py-2 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-[13px] font-medium leading-5 text-foreground">
                    {spec.label}
                    {name ? (
                      <span className="font-normal text-muted-foreground"> · {name}</span>
                    ) : null}
                  </p>
                  {amount != null ? (
                    <span className="tnum shrink-0 text-[12.5px] font-medium text-foreground">
                      {formatINR(amount)}
                    </span>
                  ) : null}
                </div>

                {item.reason ? (
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-muted-foreground">
                    {item.reason}
                  </p>
                ) : null}

                {item.case?.id ? (
                  <Link
                    to="/recovery/$id"
                    params={{ id: item.case.id }}
                    className="mono mt-1 inline-block text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-brand hover:underline"
                  >
                    {caseRef(item.case.id)}
                  </Link>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ActivityFeedSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-4 py-4 sm:px-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid grid-cols-[46px_1fr] gap-x-3">
          <Shimmer className="mt-1 h-3 w-9 justify-self-end" />
          <div className="space-y-1.5 pl-5">
            <Shimmer className="h-3.5 w-2/5" />
            <Shimmer className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
