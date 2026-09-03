/**
 * Recovery Cases.
 *
 * The full ledger, filterable. Filters are read-only server-side queries — they
 * narrow what is shown and never change a case.
 *
 * Origin is a first-class filter here rather than an afterthought, because a
 * reviewer needs to be able to say "show me only real merchant traffic" and get
 * exactly that.
 */

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, SlidersHorizontal } from "lucide-react";

import { AppLayout, PageBody, PageHeader } from "@/components/AppLayout";
import {
  EmptyState,
  ErrorState,
  Panel,
  PanelHeader,
  StatusBadge,
} from "@/components/Primitives";
import { CaseTable, CaseTableSkeleton } from "@/components/CaseTable";
import { SearchField, SecondaryButton, SelectField } from "@/components/FormKit";
import { api } from "@/lib/api";
import {
  CASE_STATUS_ORDER,
  DIAGNOSIS_ORDER,
  caseStatus,
  diagnosisLabel,
  formatAmount,
  ORIGIN_LABEL,
} from "@/lib/format";

export const Route = createFileRoute("/recovery")({
  component: RecoveryPage,
});

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  ...CASE_STATUS_ORDER.map((status) => ({
    value: status,
    label: caseStatus(status).label,
  })),
];

const DIAGNOSIS_OPTIONS = [
  { value: "", label: "Any diagnosis" },
  ...DIAGNOSIS_ORDER.map((value) => ({ value, label: diagnosisLabel(value).label })),
];

const ORIGIN_OPTIONS = [
  { value: "", label: "Any origin" },
  { value: "live", label: ORIGIN_LABEL.live.label },
  { value: "test", label: ORIGIN_LABEL.test.label },
  { value: "synthetic", label: ORIGIN_LABEL.synthetic.label },
];

const CHANNEL_OPTIONS = [
  { value: "", label: "Any channel" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "NONE", label: "No outreach" },
];

interface Filters {
  q: string;
  status: string;
  diagnosis: string;
  source: string;
  channel: string;
}

const NO_FILTERS: Filters = { q: "", status: "", diagnosis: "", source: "", channel: "" };

/** Waits for typing to settle so each keystroke isn't a request. */
function useDebounced(value: string, delayMs = 300): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

function RecoveryPage() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounced(filters.q);

  const active = useMemo(
    () =>
      (Object.keys(NO_FILTERS) as (keyof Filters)[]).filter((key) => filters[key] !== "").length,
    [filters],
  );

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const casesQuery = useQuery({
    queryKey: [
      "cases",
      "list",
      { ...filters, q: debouncedQuery, page },
    ],
    queryFn: () =>
      api.recovery.list({
        page,
        limit: PAGE_SIZE,
        ...(debouncedQuery ? { q: debouncedQuery } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.diagnosis ? { diagnosis: filters.diagnosis } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(filters.channel ? { channel: filters.channel } : {}),
      }),
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });

  const cases = casesQuery.data?.cases ?? [];
  const total = casesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  return (
    <AppLayout>
      <PageHeader
        title="Recovery cases"
        description="Every failed payment the agent has opened a case for, newest activity first."
        actions={
          casesQuery.data ? (
            <p className="text-[13px] text-muted-foreground">
              <span className="tnum font-medium text-foreground">{formatAmount(total)}</span>{" "}
              {total === 1 ? "case" : "cases"} match
            </p>
          ) : null
        }
      />

      <PageBody className="space-y-4">
        <Panel>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
            <SearchField
              label="Search cases by customer name, email or phone"
              value={filters.q}
              onChange={(value) => set("q", value)}
              placeholder="Search name, email or phone"
              className="w-full sm:w-64"
            />
            <SelectField
              label="Filter by status"
              labelHidden
              value={filters.status}
              onChange={(value) => set("status", value)}
              options={STATUS_OPTIONS}
              className="w-full min-[480px]:w-[calc(50%-0.25rem)] sm:w-44"
            />
            <SelectField
              label="Filter by diagnosis"
              labelHidden
              value={filters.diagnosis}
              onChange={(value) => set("diagnosis", value)}
              options={DIAGNOSIS_OPTIONS}
              className="w-full min-[480px]:w-[calc(50%-0.25rem)] sm:w-52"
            />
            <SelectField
              label="Filter by origin of the failure event"
              labelHidden
              value={filters.source}
              onChange={(value) => set("source", value)}
              options={ORIGIN_OPTIONS}
              className="w-full min-[480px]:w-[calc(50%-0.25rem)] sm:w-36"
            />
            <SelectField
              label="Filter by outreach channel"
              labelHidden
              value={filters.channel}
              onChange={(value) => set("channel", value)}
              options={CHANNEL_OPTIONS}
              className="w-full min-[480px]:w-[calc(50%-0.25rem)] sm:w-40"
            />
            {active > 0 ? (
              <SecondaryButton
                onClick={() => {
                  setFilters(NO_FILTERS);
                  setPage(1);
                }}
              >
                Clear {active === 1 ? "filter" : `${active} filters`}
              </SecondaryButton>
            ) : null}
          </div>

          {filters.source === "synthetic" ? (
            <p className="border-t border-hairline bg-surface-2 px-4 py-2 text-[12px] text-muted-foreground sm:px-5">
              Showing generated evaluation data only. These cases were never real merchant
              payments.
            </p>
          ) : null}
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader
            title="Cases"
            description={
              total > 0
                ? `Showing ${formatAmount(firstRow)}–${formatAmount(lastRow)} of ${formatAmount(total)}.`
                : "Nothing matches the current filters."
            }
            action={
              casesQuery.isFetching && !casesQuery.isPending ? (
                <StatusBadge tone="idle">Refreshing</StatusBadge>
              ) : null
            }
          />

          {casesQuery.isPending ? (
            <CaseTableSkeleton rows={8} />
          ) : casesQuery.isError ? (
            <ErrorState
              title="Cases are unavailable"
              description="The recovery service did not return the case list."
              onRetry={() => void casesQuery.refetch()}
            />
          ) : cases.length === 0 ? (
            active > 0 ? (
              <EmptyState
                icon={<SlidersHorizontal className="size-4" />}
                title="No cases match these filters"
                description="Widen the filters, or clear them to see every case."
                action={
                  <SecondaryButton
                    onClick={() => {
                      setFilters(NO_FILTERS);
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </SecondaryButton>
                }
              />
            ) : (
              <EmptyState
                title="No recovery cases yet"
                description="A case is opened the moment a payment fails. Run the Test Agent to put one through the full pipeline."
                action={
                  <Link
                    to="/test-agent"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <FlaskConical className="size-3.5" aria-hidden />
                    Test the agent
                  </Link>
                }
              />
            )
          ) : (
            <CaseTable cases={cases} density="full" />
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 sm:px-5">
              <p className="text-[12px] text-muted-foreground">
                Page <span className="tnum font-medium text-foreground">{page}</span> of{" "}
                <span className="tnum">{totalPages}</span>
              </p>
              <div className="flex gap-2">
                <SecondaryButton
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </SecondaryButton>
                <SecondaryButton
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </SecondaryButton>
              </div>
            </div>
          ) : null}
        </Panel>
      </PageBody>
    </AppLayout>
  );
}
