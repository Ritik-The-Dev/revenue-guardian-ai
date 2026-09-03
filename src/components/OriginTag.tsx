/**
 * Origin tag.
 *
 * The recovery pipeline is identical for every case; what differs is where the
 * originating failure event came from. Operators and judges must always be able
 * to tell synthetic evaluation rows apart from real merchant traffic, so this
 * label is never omitted on non-live data.
 */

import { ORIGIN_LABEL, originOf, type Origin } from "@/lib/format";
import { cn } from "@/lib/utils";

const STYLE: Record<Origin, string> = {
  live: "border-pos-line bg-pos-soft text-pos",
  test: "border-info-line bg-info-soft text-info",
  synthetic: "border-border bg-surface-2 text-muted-foreground",
};

export function OriginTag({
  origin,
  className,
  hideLive = false,
}: {
  origin: Origin;
  className?: string | undefined;
  /** On pages that only ever show live traffic, the tag is noise. */
  hideLive?: boolean | undefined;
}) {
  if (hideLive && origin === "live") return null;
  const spec = ORIGIN_LABEL[origin];
  return (
    <span
      title={spec.hint}
      className={cn(
        "inline-flex items-center rounded-[3px] border px-1.5 py-px",
        "text-[10px] font-semibold uppercase tracking-[0.07em] whitespace-nowrap",
        STYLE[origin],
        className,
      )}
    >
      {spec.label}
    </span>
  );
}

export function OriginTagFor({
  paymentId,
  className,
  hideLive = false,
}: {
  paymentId: string | null | undefined;
  className?: string | undefined;
  hideLive?: boolean | undefined;
}) {
  return <OriginTag origin={originOf(paymentId)} className={className} hideLive={hideLive} />;
}
