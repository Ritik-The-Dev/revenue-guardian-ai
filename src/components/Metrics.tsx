/**
 * Numeric display.
 *
 * The count-up animates how a number arrives on screen; the number itself is
 * always the value the backend returned. When the value changes, the animation
 * starts from the previous real value, never from zero-as-decoration.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TONE_TEXT, type Tone } from "@/lib/format";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useCountUp(target: number, durationMs = 700): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    if (from === target) return;

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic — fast arrival, gentle settle.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (target - from) * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = target;
    };
  }, [target, durationMs]);

  return display;
}

export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const display = useCountUp(value);
  return (
    <span className={cn("tnum", className)}>{format(display)}</span>
  );
}

export function MetricTile({
  label,
  value,
  hint,
  tone = "idle",
  loading = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-4 sm:px-5 sm:py-5", className)}>
      <p className="eyebrow">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-28 animate-pulse rounded bg-surface-2" />
      ) : (
        <p className={cn("figure mt-2", tone === "idle" ? "text-foreground" : TONE_TEXT[tone])}>
          {value}
        </p>
      )}
      {hint ? (
        <p className="mt-1.5 text-[12px] leading-4 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * A horizontal proportion bar. Width is the real ratio; nothing is padded to
 * look better than it is.
 */
export function ProportionBar({
  value,
  max,
  tone = "info",
  className,
  label,
}: {
  value: number;
  max: number;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill: Record<Tone, string> = {
    pos: "bg-pos",
    warn: "bg-warn",
    neg: "bg-neg",
    info: "bg-info",
    idle: "bg-idle",
  };
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="img"
      aria-label={label ?? `${Math.round(pct)} percent`}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", fill[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
