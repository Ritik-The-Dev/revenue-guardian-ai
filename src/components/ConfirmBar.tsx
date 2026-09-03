/**
 * Inline confirmation for a destructive change.
 *
 * This is deliberately not a modal dialog: nothing is trapped, the page stays
 * readable behind it, and it does not claim `role="alertdialog"` — a role that
 * obliges focus containment we are not providing. It is an alert region that
 * takes focus when it appears, announces what will happen, and cancels on
 * Escape. Focus returns to whatever had it when the bar closes.
 */

import { useEffect, useId, useRef } from "react";

import { PrimaryButton, SecondaryButton } from "@/components/FormKit";
import { cn } from "@/lib/utils";

export function ConfirmBar({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy,
  className,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean | undefined;
  className?: string | undefined;
}) {
  const headingId = useId();
  const region = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  // Take focus on appearance so the message is announced, and hand it back on
  // close so a keyboard user does not lose their place.
  useEffect(() => {
    const previous = document.activeElement;
    restoreTo.current = previous instanceof HTMLElement ? previous : null;
    region.current?.focus();
    return () => {
      const target = restoreTo.current;
      if (target && target.isConnected) target.focus();
    };
  }, []);

  // Escape is the expected way out of a confirmation.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.stopPropagation();
      onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  return (
    <div
      ref={region}
      role="alert"
      tabIndex={-1}
      aria-labelledby={headingId}
      className={cn(
        "animate-fade-in rounded-lg border border-warn-line bg-warn-soft px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5",
        className,
      )}
    >
      <p id={headingId} className="text-[13.5px] font-semibold text-foreground">
        {title}
      </p>
      <p className="mt-1 max-w-2xl text-[13px] leading-5 text-foreground/80">{body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <PrimaryButton size="sm" loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </PrimaryButton>
        <SecondaryButton size="sm" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </SecondaryButton>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Press Escape to cancel.</p>
    </div>
  );
}
