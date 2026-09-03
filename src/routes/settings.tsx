/**
 * Settings.
 *
 * Two very different things live on this page, and they are kept visually
 * separate: the policy limits the agent is bound by, and the read-only view of
 * what is actually configured on the backend.
 *
 * The synthetic data generator sits at the bottom, behind an explicit
 * acknowledgement, because it runs the real pipeline — it is a load generator,
 * not a mock.
 *
 * No key material is read or displayed here. Integration state arrives from
 * GET /api/system/status as booleans and mode labels only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Save } from "lucide-react";

import { AppLayout, PageBody, PageHeader } from "@/components/AppLayout";
import { ErrorState, Panel, PanelHeader, Shimmer, StatusBadge } from "@/components/Primitives";
import { OriginTag } from "@/components/OriginTag";
import {
  AmountField,
  CheckboxField,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  TextField,
} from "@/components/FormKit";
import { api, ApiError, type PolicySettings } from "@/lib/api";
import { formatDateTime, formatINR } from "@/lib/format";
import { integrationRows, useSystemStatus } from "@/lib/useSystemStatus";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

// ── Policy form ──────────────────────────────────────────────────────────────

type FieldKey =
  | "maxRetryAttempts"
  | "maxOutreachAttempts"
  | "cooldownHours"
  | "minimumRecoveryValue"
  | "highValueThreshold"
  | "lowConfidenceThreshold";

interface FieldSpec {
  key: FieldKey;
  label: string;
  hint: string;
  kind: "int" | "money" | "ratio";
  min: number;
  max: number;
}

const FIELDS: FieldSpec[] = [
  {
    key: "maxRetryAttempts",
    label: "Retries per case",
    hint: "How many times the agent may reschedule a payment attempt before it gives up.",
    kind: "int",
    min: 0,
    max: 10,
  },
  {
    key: "maxOutreachAttempts",
    label: "Messages per case",
    hint: "The hard ceiling on WhatsApp and email messages one case can ever produce.",
    kind: "int",
    min: 0,
    max: 10,
  },
  {
    key: "cooldownHours",
    label: "Cooldown between messages (hours)",
    hint: "The agent will not contact the same customer again inside this window.",
    kind: "int",
    min: 0,
    max: 720,
  },
  {
    key: "minimumRecoveryValue",
    label: "Minimum worth pursuing",
    hint: "Cases with a lower expected recovery value are stopped instead of worked.",
    kind: "money",
    min: 0,
    max: 100_000,
  },
  {
    key: "highValueThreshold",
    label: "High-value threshold",
    hint: "Above this amount the agent sends a payment link rather than retrying quietly.",
    kind: "money",
    min: 0,
    max: 10_00_000,
  },
  {
    key: "lowConfidenceThreshold",
    label: "Minimum diagnosis confidence",
    hint: "A diagnosis below this confidence is escalated instead of acted on. 0.60 means 60%.",
    kind: "ratio",
    min: 0,
    max: 1,
  },
];

type FormValues = Record<FieldKey, string>;

function toForm(settings: PolicySettings): FormValues {
  return {
    maxRetryAttempts: String(settings.maxRetryAttempts),
    maxOutreachAttempts: String(settings.maxOutreachAttempts),
    cooldownHours: String(settings.cooldownHours),
    minimumRecoveryValue: String(settings.minimumRecoveryValue),
    highValueThreshold: String(settings.highValueThreshold),
    lowConfidenceThreshold: String(settings.lowConfidenceThreshold),
  };
}

/** Parses one field. Returns the number, or the reason it cannot be used. */
function parseField(spec: FieldSpec, raw: string): { value: number } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: "Enter a value." };

  if (spec.kind === "ratio") {
    if (!/^\d*\.?\d+$/.test(trimmed)) return { error: "Enter a number between 0 and 1." };
    const value = Number.parseFloat(trimmed);
    if (Number.isNaN(value)) return { error: "Enter a number between 0 and 1." };
    if (value < spec.min || value > spec.max) return { error: "Must be between 0 and 1." };
    return { value };
  }

  if (!/^\d+$/.test(trimmed)) return { error: "Whole numbers only." };
  const value = Number.parseInt(trimmed, 10);
  if (value < spec.min || value > spec.max) {
    return {
      error:
        spec.kind === "money"
          ? `Must be between ${formatINR(spec.min)} and ${formatINR(spec.max)}.`
          : `Must be between ${spec.min} and ${spec.max}.`,
    };
  }
  return { value };
}

function PolicyPanel() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });

  const [form, setForm] = useState<FormValues | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt the saved values once, and again whenever the server value changes
  // while the form is untouched. A dirty form is never overwritten underneath
  // the person editing it.
  const saved = settingsQuery.data;
  useEffect(() => {
    if (saved && form === null) setForm(toForm(saved));
  }, [saved, form]);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const parsed = useMemo(() => {
    if (!form) return null;
    const values: Partial<Record<FieldKey, number>> = {};
    const errors: Partial<Record<FieldKey, string>> = {};
    for (const spec of FIELDS) {
      const result = parseField(spec, form[spec.key]);
      if ("value" in result) values[spec.key] = result.value;
      else errors[spec.key] = result.error;
    }
    return { values, errors, valid: Object.keys(errors).length === 0 };
  }, [form]);

  const dirty = useMemo(() => {
    if (!saved || !parsed) return false;
    return FIELDS.some((spec) => {
      const next = parsed.values[spec.key];
      return next !== undefined && next !== saved[spec.key];
    });
  }, [saved, parsed]);

  const saveMutation = useMutation({
    mutationFn: (values: PolicySettings) => api.settings.save(values),
    onSuccess: (next) => {
      setForm(toForm(next));
      setSaveError(null);
      setServerFieldErrors({});
      setSavedAt(Date.now());
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedAt(null), 4000);
      void qc.invalidateQueries({ queryKey: ["settings"] });
      void qc.invalidateQueries({ queryKey: ["system", "status"] });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        setSaveError(error.message);
        setServerFieldErrors(error.fieldErrors);
      } else {
        setSaveError("These limits could not be saved. Try again.");
        setServerFieldErrors({});
      }
    },
  });

  function submit() {
    if (!parsed?.valid) return;
    const { values } = parsed;
    if (
      values.maxRetryAttempts === undefined ||
      values.maxOutreachAttempts === undefined ||
      values.cooldownHours === undefined ||
      values.minimumRecoveryValue === undefined ||
      values.highValueThreshold === undefined ||
      values.lowConfidenceThreshold === undefined
    ) {
      return;
    }
    setSaveError(null);
    saveMutation.mutate({
      maxRetryAttempts: values.maxRetryAttempts,
      maxOutreachAttempts: values.maxOutreachAttempts,
      cooldownHours: values.cooldownHours,
      minimumRecoveryValue: values.minimumRecoveryValue,
      highValueThreshold: values.highValueThreshold,
      lowConfidenceThreshold: values.lowConfidenceThreshold,
    });
  }

  return (
    <Panel>
      <PanelHeader
        title="Policy limits"
        description="The bounds the agent works inside. It cannot exceed them; a case that would is escalated instead."
        action={
          savedAt !== null ? <StatusBadge tone="pos">Saved</StatusBadge> : dirty ? (
            <StatusBadge tone="warn">Unsaved changes</StatusBadge>
          ) : null
        }
      />

      {settingsQuery.isError ? (
        <ErrorState
          title="Policy limits are unavailable"
          description="The recovery service did not return the saved limits, so they cannot be edited safely."
          onRetry={() => void settingsQuery.refetch()}
        />
      ) : !form || !parsed ? (
        <div className="grid gap-x-6 gap-y-5 px-4 py-5 sm:grid-cols-2 sm:px-5">
          {FIELDS.map((spec) => (
            <div key={spec.key}>
              <Shimmer className="h-3.5 w-40" />
              <Shimmer className="mt-2 h-3 w-full max-w-[15rem]" />
              <Shimmer className="mt-2.5 h-9 w-full max-w-[12rem]" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <form
            className="grid gap-x-6 gap-y-5 px-4 py-5 sm:grid-cols-2 sm:px-5"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {FIELDS.map((spec) => {
              const error = parsed.errors[spec.key] ?? serverFieldErrors[spec.key];
              const value = form[spec.key];
              const onChange = (next: string) =>
                setForm((previous) => (previous ? { ...previous, [spec.key]: next } : previous));

              if (spec.kind === "money") {
                return (
                  <AmountField
                    key={spec.key}
                    label={spec.label}
                    hint={spec.hint}
                    value={value}
                    onChange={onChange}
                    error={error}
                    disabled={saveMutation.isPending}
                  />
                );
              }

              return (
                <TextField
                  key={spec.key}
                  label={spec.label}
                  hint={spec.hint}
                  value={value}
                  onChange={onChange}
                  error={error}
                  inputMode={spec.kind === "ratio" ? "text" : "numeric"}
                  disabled={saveMutation.isPending}
                  mono
                />
              );
            })}

            {/* Submit lives in the footer, but the form still needs a submit
                control for keyboard users pressing Enter in a field. */}
            <button type="submit" className="sr-only">
              Save limits
            </button>
          </form>

          {saveError ? (
            <p
              role="alert"
              className="mx-4 mb-4 rounded-md border border-neg-line bg-neg-soft px-3 py-2 text-[12.5px] text-neg sm:mx-5"
            >
              {saveError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 sm:px-5">
            <PrimaryButton
              onClick={submit}
              loading={saveMutation.isPending}
              disabled={!dirty || !parsed.valid}
            >
              {!saveMutation.isPending ? <Save className="size-3.5" aria-hidden /> : null}
              Save limits
            </PrimaryButton>
            <SecondaryButton
              disabled={!dirty || saveMutation.isPending}
              onClick={() => {
                if (saved) setForm(toForm(saved));
                setSaveError(null);
                setServerFieldErrors({});
              }}
            >
              Discard changes
            </SecondaryButton>
            <p className="ml-auto text-[12px] leading-4 text-muted-foreground">
              New cases use the saved limits. A case already in progress keeps the limits it
              started with.
            </p>
          </div>
        </>
      )}
    </Panel>
  );
}

// ── Configuration (read-only) ────────────────────────────────────────────────

function ConfigurationPanel() {
  const { data, isPending, isError, refetch } = useSystemStatus();
  const rows = integrationRows(data ?? null);

  return (
    <Panel>
      <PanelHeader
        title="Integrations"
        description="Set in the backend environment, not here. This page reads whether each integration is configured — never its credentials."
        action={
          data && data.razorpayMode !== "not_configured" ? (
            <StatusBadge
              tone={data.razorpayMode === "live" ? "warn" : "info"}
              title={
                data.razorpayMode === "live"
                  ? "Live Razorpay keys. Real payments and real money."
                  : "Razorpay test keys. No real money moves."
              }
            >
              Razorpay {data.razorpayMode} keys
            </StatusBadge>
          ) : null
        }
      />

      {isPending ? (
        <div className="divide-y divide-hairline">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 sm:px-5">
              <Shimmer className="h-3.5 w-32" />
              <Shimmer className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      ) : isError || !data ? (
        <ErrorState
          title="Configuration state is unavailable"
          description="The recovery service did not answer the status check, so this list would be a guess."
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <dl className="divide-y divide-hairline">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5"
              >
                <dt className="flex items-center gap-2 text-[13px] text-foreground">
                  <span
                    aria-hidden
                    className={cn("size-1.5 shrink-0 rounded-full", row.ok ? "bg-pos" : "bg-idle")}
                  />
                  {row.label}
                </dt>
                <dd className={cn("text-[12.5px]", row.ok ? "text-muted-foreground" : "text-warn")}>
                  {row.note}
                </dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground sm:px-5">
            Checked {formatDateTime(data.checkedAt)}. When an outreach channel is not configured the
            agent records the action as failed rather than pretending it was sent.
          </p>
        </>
      )}
    </Panel>
  );
}

// ── Synthetic data ───────────────────────────────────────────────────────────

const BATCH_OPTIONS = [
  { value: "25", label: "25 cases" },
  { value: "50", label: "50 cases" },
  { value: "100", label: "100 cases" },
];

function SyntheticDataPanel() {
  const qc = useQueryClient();
  const [count, setCount] = useState("25");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ generated: number; failed: number } | null>(null);

  const generate = useMutation({
    mutationFn: (n: number) => api.demo.generateBatch(n),
    onSuccess: (response) => {
      setResult({ generated: response.generated, failed: response.failed });
      setError(null);
      setAcknowledged(false);
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["cases"] });
      void qc.invalidateQueries({ queryKey: ["escalations"] });
    },
    onError: (err: unknown) => {
      setResult(null);
      setError(
        err instanceof ApiError
          ? err.message
          : "The batch could not be generated. Check that the backend is still running.",
      );
    },
  });

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            Synthetic evaluation data
            <OriginTag origin="synthetic" />
          </span>
        }
        description="Fills the database with generated failed payments so the dashboard and case list can be reviewed at volume."
      />

      <div className="space-y-3.5 px-4 py-4 sm:px-5">
        <div className="rounded-md border border-warn-line bg-warn-soft px-3 py-2.5">
          <p className="text-[12.5px] font-medium text-foreground">
            This is not a mock. It runs the real recovery pipeline.
          </p>
          <p className="mt-1 text-[12px] leading-[1.5] text-foreground/80">
            Every generated case is diagnosed, evaluated against the policy limits above, and
            executed for real — including Razorpay payment links, and WhatsApp or email delivery to
            the generator's placeholder contacts. Expect provider failures against those contacts,
            and expect the run to take a few minutes. Cases created this way are labelled
            Synthetic everywhere and are never merchant revenue.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="How many cases"
            value={count}
            onChange={setCount}
            options={BATCH_OPTIONS}
            disabled={generate.isPending}
            className="w-44"
          />
        </div>

        <CheckboxField
          tone="warn"
          checked={acknowledged}
          onChange={setAcknowledged}
          disabled={generate.isPending}
          label="I understand this executes real recovery actions"
          description="Payment links will be created and outreach will be attempted for each generated case, within the policy limits above."
        />

        <div className="flex flex-wrap items-center gap-2">
          <PrimaryButton
            onClick={() => {
              setError(null);
              setResult(null);
              generate.mutate(Number.parseInt(count, 10));
            }}
            disabled={!acknowledged}
            loading={generate.isPending}
          >
            {!generate.isPending ? <Database className="size-3.5" aria-hidden /> : null}
            {generate.isPending ? "Generating — leave this page open" : "Generate synthetic cases"}
          </PrimaryButton>
          <Link
            to="/recovery"
            className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium transition-colors hover:bg-accent"
          >
            Go to cases
          </Link>
        </div>

        {result ? (
          <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-foreground">
            <span className="tnum font-medium">{result.generated}</span> synthetic{" "}
            {result.generated === 1 ? "case" : "cases"} created
            {result.failed > 0 ? (
              <>
                , <span className="tnum font-medium text-warn">{result.failed}</span> failed before
                a case was opened
              </>
            ) : null}
            . Filter the case list by origin to see them on their own.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-neg-line bg-neg-soft px-3 py-2 text-[12.5px] text-neg"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function SettingsPage() {
  return (
    <AppLayout>
      <PageHeader
        title="Settings"
        description="What the agent is allowed to do, and what it is currently wired to."
      />
      <PageBody className="max-w-4xl space-y-4">
        <PolicyPanel />
        <ConfigurationPanel />
        <SyntheticDataPanel />
      </PageBody>
    </AppLayout>
  );
}
