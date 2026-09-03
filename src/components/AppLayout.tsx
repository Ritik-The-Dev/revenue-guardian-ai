/**
 * Application shell.
 *
 * A fixed ink sidebar and a slim top bar. The identity mark is the same audit
 * rule that runs through the decision trace and the live agent run, so the
 * navigation and the instrument read as one object.
 *
 * The status indicator in the sidebar is driven by a real health check against
 * the backend. It is never green by default.
 */

import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  FlaskConical,
  Gauge,
  Menu,
  Moon,
  Receipt,
  Settings2,
  ShieldAlert,
  Sun,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { StatusDot } from "@/components/Primitives";
import { toggleTheme } from "@/lib/theme";
import { integrationRows, useAgentHealth } from "@/lib/useSystemStatus";

const NAV = [
  { to: "/", label: "Overview", icon: Gauge, exact: true },
  { to: "/test-agent", label: "Test Agent", icon: FlaskConical, exact: false },
  { to: "/recovery", label: "Recovery Cases", icon: Receipt, exact: false },
  { to: "/escalations", label: "Escalations", icon: ShieldAlert, exact: false },
  { to: "/settings", label: "Settings", icon: Settings2, exact: false },
] as const;

function isActive(pathname: string, to: string, exact: boolean): boolean {
  if (exact) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function sectionOf(pathname: string): string {
  const match = [...NAV]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => isActive(pathname, item.to, item.exact));
  return match?.label ?? "Revenue Guardian";
}

// ── Identity ─────────────────────────────────────────────────────────────────

/** The mark: a ledger rule with two entries against it. */
function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M5.5 2.75v14.5" />
      <path d="M5.5 6.75h9" />
      <path d="M5.5 11.25h6" />
      <circle cx="14.5" cy="6.75" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Wordmark() {
  return (
    <Link
      to="/"
      className="flex items-start gap-2.5 rounded-md px-1 py-0.5 transition-opacity hover:opacity-80"
    >
      <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-primary text-primary-foreground">
        <Mark className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold leading-4 tracking-[-0.01em] text-foreground">
          Revenue Guardian
        </span>
        <span className="block text-[11px] leading-4 text-muted-foreground">
          Recovery agent
        </span>
      </span>
    </Link>
  );
}

// ── Navigation ───────────────────────────────────────────────────────────────

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav aria-label="Sections" className="space-y-0.5">
      {NAV.map(({ to, label, icon: Icon, exact }) => {
        const active = isActive(pathname, to, exact);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-md py-[7px] pl-3 pr-2.5",
              "text-[13px] leading-5 transition-colors duration-150",
              active
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {/* The active marker is the audit rule, not a coloured pill. */}
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-1/2 h-[15px] w-[2px] -translate-y-1/2 rounded-full transition-opacity duration-200",
                active ? "bg-brand opacity-100" : "opacity-0",
              )}
            />
            <Icon
              className={cn(
                "size-[15px] shrink-0 transition-colors",
                active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
              )}
              aria-hidden
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// ── Health ───────────────────────────────────────────────────────────────────

function AgentStatusBlock({ compact = false }: { compact?: boolean }) {
  const { health, label, hint, tone, status } = useAgentHealth();
  const rows = integrationRows(status);

  return (
    <div className={cn("rounded-md border border-border bg-surface-2", compact ? "p-2.5" : "p-3")}>
      <div className="flex items-center gap-2">
        <StatusDot tone={tone} pulse={health === "online"} />
        <span className="text-[12px] font-medium text-foreground">{label}</span>
        {status && status.razorpayMode !== "not_configured" ? (
          <span
            className="ml-auto rounded-[3px] border border-border bg-surface px-1 py-px text-[9.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground"
            title={
              status.razorpayMode === "test"
                ? "Razorpay test keys — no real money moves."
                : "Razorpay live keys — real payments."
            }
          >
            {/* The word alone is only meaningful with the label read out. */}
            <span className="sr-only">Razorpay keys: </span>
            {status.razorpayMode}
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{hint}</p>

      {rows.length > 0 ? (
        <dl className="mt-2.5 space-y-1 border-t border-hairline pt-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn("size-1.5 shrink-0 rounded-full", row.ok ? "bg-pos" : "bg-idle")}
              />
              <dt className="text-[11px] text-muted-foreground">{row.label}</dt>
              <dd
                className={cn(
                  "ml-auto text-[10.5px]",
                  row.ok ? "text-muted-foreground" : "text-warn",
                )}
              >
                {row.note}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/** Compact indicator for the top bar. Same source of truth. */
function HeaderStatus() {
  const { label, hint, tone, health } = useAgentHealth();
  return (
    <span
      role="status"
      title={hint}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-[11.5px] font-medium text-foreground"
    >
      <StatusDot tone={tone} pulse={health === "online"} />
      {/* Hidden from view on narrow screens, never hidden from a screen reader. */}
      <span className="sr-only sm:not-sr-only sm:inline">{label}</span>
    </span>
  );
}

// ── Theme ────────────────────────────────────────────────────────────────────

function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={() => toggleTheme()}
      className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label="Switch between light and dark theme"
      title="Switch theme"
    >
      {/* Both icons are rendered; CSS decides which is visible, so the
          server-rendered markup matches the first client render exactly. */}
      <Sun className="size-4 dark:hidden" aria-hidden />
      <Moon className="hidden size-4 dark:block" aria-hidden />
    </button>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const section = sectionOf(pathname);

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Sidebar — fixed on desktop so long tables scroll under it. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col border-r border-border bg-sidebar lg:flex">
        <div className="px-4 pb-3 pt-4">
          <Wordmark />
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-3">
          <NavList />
        </div>
        <div className="p-3">
          <AgentStatusBlock />
        </div>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-[268px] gap-0 border-border bg-sidebar p-0 sm:max-w-[268px]"
        >
          <SheetTitle className="sr-only">Sections</SheetTitle>
          <div className="px-4 pb-3 pt-4">
            <Wordmark />
          </div>
          <div className="px-3">
            <NavList onNavigate={() => setOpen(false)} />
          </div>
          <div className="mt-4 px-3 pb-4">
            <AgentStatusBlock compact />
          </div>
        </SheetContent>
      </Sheet>

      <div className="lg:pl-[236px]">
        {/* Top bar — the section you are in, plus the two global controls. */}
        <header className="sticky top-0 z-20 flex h-13 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-sm sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-4" aria-hidden />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-medium text-foreground">{section}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <HeaderStatus />
            <ThemeToggle />
          </div>
        </header>

        <main id="main" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Page title block. Rendered by each route so the page owns its own heading,
 * description and actions.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  badges,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Small line above the title — a back link or breadcrumb. */
  eyebrow?: React.ReactNode | undefined;
  /** Status chips shown on the title line. */
  badges?: React.ReactNode | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-4 border-b border-border px-4 pb-5 pt-6 sm:px-6",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2">{eyebrow}</div> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.021em] text-foreground sm:text-[25px] sm:leading-8">
            {title}
          </h1>
          {badges ? <div className="flex items-center gap-2">{badges}</div> : null}
        </div>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Standard content padding, so every page lines up with the header. */
export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("px-4 py-5 sm:px-6 sm:py-6", className)}>{children}</div>;
}
