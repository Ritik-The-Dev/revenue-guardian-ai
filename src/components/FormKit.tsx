/**
 * Form controls.
 *
 * Flat, hairline-bordered fields that match the rest of the interface, with the
 * accessibility wiring done once: every field labels itself, announces its own
 * error through aria-describedby, and shows a visible focus ring.
 */

import { useId } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode | undefined;
  error?: string | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label
        htmlFor={id}
        className="block text-[12px] font-medium leading-4 text-foreground"
      >
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-[11.5px] leading-4 text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[11.5px] leading-4 text-neg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "h-9 w-full rounded-md border bg-surface px-2.5 text-[13px] leading-5 text-foreground " +
  "placeholder:text-muted-foreground/70 transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-55";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  type = "text",
  inputMode,
  autoComplete,
  maxLength,
  disabled,
  prefix,
  mono,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  hint?: React.ReactNode | undefined;
  error?: string | undefined;
  type?: string | undefined;
  inputMode?: "text" | "numeric" | "tel" | "email" | undefined;
  autoComplete?: string | undefined;
  maxLength?: number | undefined;
  disabled?: boolean | undefined;
  prefix?: string | undefined;
  mono?: boolean | undefined;
  className?: string | undefined;
}) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <div className="flex items-stretch">
        {prefix ? (
          <span className="mono inline-flex select-none items-center rounded-l-md border border-r-0 border-input bg-surface-2 px-2 text-[12.5px] text-muted-foreground">
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            CONTROL,
            prefix && "rounded-l-none",
            mono && "mono tnum",
            error ? "border-neg" : "border-input",
            className,
          )}
        />
      </div>
    </FieldShell>
  );
}

export function AmountField({
  label,
  value,
  onChange,
  hint,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string | undefined;
  error?: string | undefined;
  disabled?: boolean | undefined;
}) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className="flex items-stretch">
        <span className="inline-flex select-none items-center rounded-l-md border border-r-0 border-input bg-surface-2 px-2.5 text-[13px] text-muted-foreground">
          ₹
        </span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            CONTROL,
            "tnum rounded-l-none font-medium",
            error ? "border-neg" : "border-input",
          )}
        />
      </div>
    </FieldShell>
  );
}

/** A native select, styled flat. Native because it is the most reliable
 *  keyboard and screen-reader control for a short list of known values. */
export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  disabled,
  labelHidden,
  size = "md",
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  hint?: string | undefined;
  error?: string | undefined;
  disabled?: boolean | undefined;
  labelHidden?: boolean | undefined;
  size?: "sm" | "md";
  className?: string | undefined;
}) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;

  const control = (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          CONTROL,
          "cursor-pointer appearance-none pr-7",
          size === "sm" && "h-8 text-[12.5px]",
          error ? "border-neg" : "border-input",
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M4 6.5 8 10.5l4-4" />
      </svg>
    </div>
  );

  if (labelHidden) {
    return (
      <div className={cn("min-w-0", className)}>
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        {control}
      </div>
    );
  }

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      {control}
    </FieldShell>
  );
}

/** Search box with a clear affordance. Filtering is the caller's job. */
export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  className?: string | undefined;
}) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(CONTROL, "border-input pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden")}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[12.5px] font-medium leading-4 text-foreground">
          {label}
        </label>
        {hint ? (
          <p className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors duration-200",
          checked ? "border-primary bg-primary" : "border-input bg-surface-3",
          disabled && "cursor-not-allowed opacity-55",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute size-[12px] rounded-full bg-surface transition-transform duration-200",
            checked ? "translate-x-[16px]" : "translate-x-[2px]",
          )}
        />
      </button>
    </div>
  );
}

export function CheckboxField({
  label,
  description,
  checked,
  onChange,
  error,
  disabled,
  tone = "default",
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | undefined;
  disabled?: boolean | undefined;
  tone?: "default" | "warn";
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "rounded-md border p-3 transition-colors",
        error
          ? "border-neg bg-neg-soft/40"
          : tone === "warn"
            ? "border-warn-line bg-warn-soft/45"
            : "border-border bg-surface-2",
      )}
    >
      <div className="flex gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-[2px] size-[15px] shrink-0 cursor-pointer accent-[var(--color-primary)]"
        />
        <div className="min-w-0">
          <label htmlFor={id} className="block text-[12.5px] font-medium leading-[1.45] text-foreground">
            {label}
          </label>
          {description ? (
            <div className="mt-1 text-[11.5px] leading-[1.5] text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-[11.5px] leading-4 text-neg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RadioCards<T extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
  error,
  disabled,
}: {
  legend: string;
  hint?: string | undefined;
  options: { value: T; label: string; description: string }[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | undefined;
  disabled?: boolean | undefined;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-[12px] font-medium leading-4 text-foreground">{legend}</legend>
      {hint ? (
        <p className="mt-1 text-[11.5px] leading-4 text-muted-foreground">{hint}</p>
      ) : null}
      <div className="mt-2 space-y-1.5">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer gap-2.5 rounded-md border px-3 py-2.5 transition-colors duration-150",
                selected
                  ? "border-primary/45 bg-accent"
                  : "border-border bg-surface hover:bg-accent/50",
                disabled && "cursor-not-allowed opacity-55",
              )}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                className="mt-[3px] size-[14px] shrink-0 cursor-pointer accent-[var(--color-primary)]"
              />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium leading-4 text-foreground">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[11.5px] leading-4 text-neg">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium " +
  "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55";

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  loading,
  className,
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: (() => void) | undefined;
  type?: "button" | "submit";
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  className?: string | undefined;
  size?: "sm" | "md";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      className={cn(
        BUTTON_BASE,
        size === "sm" ? "h-8 px-3" : "h-9 px-3.5",
        "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  loading,
  className,
  size = "md",
  tone = "default",
}: {
  children: React.ReactNode;
  onClick?: (() => void) | undefined;
  type?: "button" | "submit";
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  className?: string | undefined;
  size?: "sm" | "md";
  tone?: "default" | "neg";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      className={cn(
        BUTTON_BASE,
        size === "sm" ? "h-8 px-2.5" : "h-9 px-3",
        "border bg-surface hover:bg-accent",
        tone === "neg" ? "border-neg-line text-neg hover:bg-neg-soft" : "border-border text-foreground",
        className,
      )}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={cn("size-3.5 animate-spin", className)}
      fill="none"
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.6" />
      <path
        d="M14.25 8A6.25 6.25 0 0 0 8 1.75"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
