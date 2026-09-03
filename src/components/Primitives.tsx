/**
 * Core surfaces and indicators.
 *
 * Structure here is hairlines and eyebrows, not shadows and nested cards.
 * A Panel is a single bordered surface; anything inside it is separated by
 * rules rather than by another card.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_CHIP, TONE_DOT, TONE_TEXT, type Tone } from "@/lib/format";

// ── Panel ────────────────────────────────────────────────────────────────────

export function Panel({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="eyebrow">{title}</h2>
        {description ? (
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A standalone section label with a hairline extending to the right. */
export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="eyebrow whitespace-nowrap">{children}</span>
      <span aria-hidden className="h-px flex-1 bg-hairline" />
    </div>
  );
}

// ── Status ───────────────────────────────────────────────────────────────────

/**
 * A status chip. Always pairs colour with a shape marker and a text label, so
 * status is never communicated by colour alone.
 */
export function StatusBadge({
  tone,
  children,
  title,
  className,
  dot = true,
}: {
  tone: Tone;
  children: ReactNode;
  title?: string | undefined;
  className?: string | undefined;
  dot?: boolean | undefined;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] border px-1.5 py-0.5",
        "text-[11px] font-medium leading-4 whitespace-nowrap",
        TONE_CHIP[tone],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden className={cn("size-1.5 rounded-[1px]", TONE_DOT[tone])} />
      ) : null}
      {children}
    </span>
  );
}

/** Live/idle indicator used in the header. Reflects a real health check. */
export function StatusDot({
  tone,
  pulse = false,
  className,
}: {
  tone: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative flex size-2 shrink-0", className)} aria-hidden>
      {pulse ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-60",
            TONE_DOT[tone],
          )}
          style={{ animationDuration: "2.4s" }}
        />
      ) : null}
      <span className={cn("relative inline-flex size-2 rounded-full", TONE_DOT[tone])} />
    </span>
  );
}

// ── Key/value ────────────────────────────────────────────────────────────────

export function Field({
  label,
  value,
  mono = false,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean | undefined;
  tone?: Tone | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-[13px] leading-5 break-words",
          mono && "mono text-[12px]",
          tone ? TONE_TEXT[tone] : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

// ── States ───────────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode | undefined;
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex size-9 items-center justify-center rounded-md border border-border bg-surface-2 text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Couldn't load this",
  description,
  onRetry,
  className,
}: {
  title?: string | undefined;
  description?: string | undefined;
  onRetry?: (() => void) | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}
    >
      <span
        aria-hidden
        className="mb-3 flex size-9 items-center justify-center rounded-md border border-neg-line bg-neg-soft text-neg"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium transition-colors hover:bg-accent"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Neutral loading block. Sized by the caller to match the real content. */
export function Shimmer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("relative overflow-hidden rounded bg-surface-2", className)}
    >
      <div className="absolute inset-0 -translate-x-full animate-sweep bg-gradient-to-r from-transparent via-black/[0.045] to-transparent dark:via-white/[0.06]" />
    </div>
  );
}
