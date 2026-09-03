/**
 * Test Agent — input form.
 *
 * The judge describes a failed payment and the customer it belongs to. On
 * submit, the backend creates a synthetic *failure event* and runs the real
 * recovery pipeline against it: real diagnosis, real policy, a real Razorpay
 * payment link, a real WhatsApp or email message.
 *
 * Because a real message is sent to a real phone number, the consent checkbox
 * is mandatory and is enforced by the backend, not here. This form only
 * mirrors that requirement so the judge understands it before submitting.
 *
 * No contact details are pre-filled. The judge's own number and address are the
 * only ones the agent will ever be given.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Play, CreditCard } from "lucide-react";

import { ApiError, api, type TestAgentRunStarted } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader, SectionLabel, Shimmer } from "@/components/Primitives";
import {
  AmountField,
  CheckboxField,
  PrimaryButton,
  RadioCards,
  TextField,
  ToggleRow,
} from "@/components/FormKit";

interface FormState {
  scenario: string;
  amount: string;
  name: string;
  phone: string;
  email: string;
  isRepeatCustomer: boolean;
  successfulPayments: string;
  lifetimeValue: string;
  failedPayments: string;
  consent: boolean;
}

const INITIAL: FormState = {
  scenario: "",
  amount: "2499",
  name: "",
  phone: "",
  email: "",
  isRepeatCustomer: true,
  successfulPayments: "3",
  lifetimeValue: "18000",
  failedPayments: "1",
  consent: false,
};

function toInt(value: string, fallback = 0): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Local pre-checks, so obvious mistakes don't need a round trip. */
function localErrors(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  const amount = toInt(form.amount, 0);

  if (!form.scenario) errors["payment.scenario"] = "Select a failure scenario.";
  if (amount < 1) errors["payment.amount"] = "Enter the amount that failed.";
  else if (amount > 500_000) errors["payment.amount"] = "Keep test amounts under ₹5,00,000.";
  if (form.name.trim().length === 0) errors["customer.name"] = "Enter a customer name.";

  const hasPhone = form.phone.replace(/\D/g, "").length >= 10;
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim());
  if (!hasPhone && !hasEmail) {
    errors["customer"] =
      "Enter a WhatsApp number or an email address so the agent has a way to reach the customer.";
  }
  if (!form.consent) {
    errors["consent"] =
      "Confirm you control these contact details before the agent sends a message.";
  }
  return errors;
}

export function TestAgentForm({
  onStarted,
  runInFlight,
}: {
  onStarted: (started: TestAgentRunStarted) => void;
  /** A run is already being watched — the form stays usable but warns. */
  runInFlight: boolean;
}) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const scenariosQuery = useQuery({
    queryKey: ["test-agent", "scenarios"],
    queryFn: api.testAgent.scenarios,
    staleTime: 5 * 60_000,
  });

  const scenarios = scenariosQuery.data?.scenarios ?? [];

  // Default to the first scenario the backend offers, never a hardcoded id.
  const scenario = form.scenario || scenarios[0]?.id || "";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear the server's opinion of a field as soon as it is edited.
    setServerErrors((prev) => {
      const next = { ...prev };
      delete next[`customer.${String(key)}`];
      delete next[`payment.${String(key)}`];
      delete next[String(key)];
      if (key === "phone" || key === "email") delete next["customer"];
      return next;
    });
  };

  const local = useMemo(() => localErrors({ ...form, scenario }), [form, scenario]);
  const errors: Record<string, string> = submitted
    ? { ...local, ...serverErrors }
    : serverErrors;

  const mutation = useMutation({
    mutationFn: api.testAgent.run,
    onSuccess: (started) => {
      setSubmitted(false);
      setServerErrors({});
      setFormError(null);
      setForm((prev) => ({ ...prev, consent: false }));
      onStarted(started);
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        setServerErrors(error.fieldErrors);
        setFormError(error.message);
      } else {
        setFormError("The run could not be started. Try again in a moment.");
      }
    },
  });

  const submit = () => {
    setSubmitted(true);
    setFormError(null);
    const problems = localErrors({ ...form, scenario });
    if (Object.keys(problems).length > 0) {
      setServerErrors({});
      return;
    }
    mutation.mutate({
      customer: {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        isRepeatCustomer: form.isRepeatCustomer,
        successfulPayments: form.isRepeatCustomer ? toInt(form.successfulPayments) : 0,
        lifetimeValue: form.isRepeatCustomer ? toInt(form.lifetimeValue) : 0,
        failedPayments: toInt(form.failedPayments),
      },
      payment: {
        amount: toInt(form.amount),
        scenario,
        currency: "INR",
      },
      consent: form.consent,
    });
  };

  const checkoutMutation = useMutation({
    mutationFn: () =>
      api.testAgent.createCheckoutOrder({
        amount: toInt(form.amount, 1),
        currency: "INR",
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      }),
    onSuccess: (order) => {
      // Dynamically load the Razorpay Checkout script and open the modal
      const load = () => {
        const options = {
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: "Revenue Guardian — Real Payment Test",
          description: "Enter failure@razorpay as UPI ID to simulate a failure",
          prefill: order.prefill,
          theme: { color: "#1a1a1a" },
          modal: { escape: true },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      };

      if ((window as Record<string, unknown>)["Razorpay"]) {
        load();
      } else {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = load;
        document.body.appendChild(script);
      }
    },
    onError: (err: unknown) => {
      setFormError(err instanceof ApiError ? err.message : "Could not create Razorpay order. Check that Razorpay credentials are configured.");
    },
  });

  const highRisk = scenario === "high_risk";
  const amountValue = toInt(form.amount, 0);

  return (
    <Panel>
      <PanelHeader
        title="Simulate a failed payment"
        description="The failure event is synthetic. Everything the agent does about it is real."
      />

      <form
        className="space-y-6 px-4 py-4 sm:px-5 sm:py-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        {/* ── The failure ─────────────────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionLabel>The failure</SectionLabel>

          {scenariosQuery.isPending ? (
            <div className="space-y-1.5" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <Shimmer key={i} className="h-[54px] rounded-md" />
              ))}
            </div>
          ) : scenariosQuery.isError ? (
            <p role="alert" className="text-[12.5px] leading-5 text-neg">
              Failure scenarios could not be loaded. Check that the recovery service is running,
              then reload this page.
            </p>
          ) : (
            <RadioCards
              legend="Why the payment failed"
              hint="Each scenario carries the real Razorpay error signal the diagnosis service reads."
              options={scenarios.map((s) => ({
                value: s.id,
                label: s.label,
                description: s.description,
              }))}
              value={scenario || null}
              onChange={(value) => set("scenario", value)}
              error={errors["payment.scenario"]}
              disabled={mutation.isPending}
            />
          )}

          <AmountField
            label="Amount that failed"
            value={form.amount}
            onChange={(v) => set("amount", v)}
            hint={
              amountValue > 0
                ? `${formatINR(amountValue)} — this is the amount any payment link will ask for.`
                : "Whole rupees. Test keys are in use, so no real money moves."
            }
            error={errors["payment.amount"]}
            disabled={mutation.isPending}
          />
        </section>

        {/* ── The customer ────────────────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionLabel>The customer</SectionLabel>

          <TextField
            label="Name"
            value={form.name}
            onChange={(v) => set("name", v)}
            placeholder="Who the payment was for"
            maxLength={80}
            autoComplete="off"
            error={errors["customer.name"]}
            disabled={mutation.isPending}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="WhatsApp number"
              value={form.phone}
              onChange={(v) => set("phone", v)}
              placeholder="8630910212"
              inputMode="tel"
              autoComplete="off"
              maxLength={20}
              mono
              hint={
                <>
                  Your own number.{" "}
                  <span className="text-foreground/70">
                    If you don't receive a message, send{" "}
                    <span className="font-medium">Hi</span> to{" "}
                    <span className="font-medium">+91 99274 71836</span> on WhatsApp first, then try again.
                  </span>
                </>
              }
              error={errors["customer.phone"]}
              disabled={mutation.isPending}
            />
            <TextField
              label="Email address"
              value={form.email}
              onChange={(v) => set("email", v)}
              placeholder="you@example.com"
              type="email"
              inputMode="email"
              autoComplete="off"
              maxLength={160}
              hint="Used if WhatsApp delivery is unavailable."
              error={errors["customer.email"]}
              disabled={mutation.isPending}
            />
          </div>

          {errors["customer"] ? (
            <p role="alert" className="text-[11.5px] leading-4 text-neg">
              {errors["customer"]}
            </p>
          ) : null}

          <div className="space-y-3.5 rounded-md border border-border bg-surface-2 p-3">
            <ToggleRow
              label="Returning customer"
              hint="Payment history raises the recovery score, which affects what policy allows."
              checked={form.isRepeatCustomer}
              onChange={(v) => set("isRepeatCustomer", v)}
              disabled={mutation.isPending}
            />
            <p className="text-[11.5px] leading-4 text-muted-foreground">
              These start at placeholder values. Whatever you leave here is the history the agent
              scores against — change them to see the decision change.
            </p>

            {form.isRepeatCustomer ? (
              <div className="grid animate-fade-in gap-3 sm:grid-cols-2">
                <TextField
                  label="Successful payments"
                  value={form.successfulPayments}
                  onChange={(v) => set("successfulPayments", v.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  mono
                  error={errors["customer.successfulPayments"]}
                  disabled={mutation.isPending}
                />
                <TextField
                  label="Lifetime value (₹)"
                  value={form.lifetimeValue}
                  onChange={(v) => set("lifetimeValue", v.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  mono
                  error={errors["customer.lifetimeValue"]}
                  disabled={mutation.isPending}
                />
              </div>
            ) : null}

            <TextField
              label="Previous failed payments"
              value={form.failedPayments}
              onChange={(v) => set("failedPayments", v.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              mono
              hint={
                highRisk
                  ? "The high-risk scenario needs a failure history, so the agent will use at least 5."
                  : "More than two recent failures lowers the recovery score."
              }
              error={errors["customer.failedPayments"]}
              disabled={mutation.isPending}
            />
          </div>
        </section>

        {/* ── Consent ─────────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <SectionLabel>Consent</SectionLabel>

          <CheckboxField
            tone="warn"
            checked={form.consent}
            onChange={(v) => set("consent", v)}
            error={errors["consent"]}
            disabled={mutation.isPending}
            label="I control this number and address, and I agree to receive a test message."
            description={
              <>
                A real WhatsApp message or email will be sent to the details above, containing a
                real Razorpay test payment link. The backend refuses to run without this
                confirmation, and limits how many messages one contact can receive.
              </>
            }
          />
        </section>

        {formError && Object.keys(serverErrors).length === 0 ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-neg-line bg-neg-soft px-3 py-2 text-[12.5px] leading-5 text-neg"
          >
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            {formError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          <PrimaryButton type="submit" loading={mutation.isPending}>
            {!mutation.isPending ? <Play className="size-3.5" aria-hidden /> : null}
            {mutation.isPending ? "Starting the agent…" : "Run the agent"}
          </PrimaryButton>
          <button
            type="button"
            onClick={() => {
              if (toInt(form.amount, 0) < 1) {
                setFormError("Enter an amount before opening the Razorpay checkout.");
                return;
              }
              setFormError(null);
              checkoutMutation.mutate();
            }}
            disabled={checkoutMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 h-9 text-[13px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-55 disabled:cursor-not-allowed"
            title="Create a real Razorpay test order and open checkout. Use failure@razorpay as UPI ID to trigger a real payment.failed webhook."
          >
            <CreditCard className="size-3.5 shrink-0" aria-hidden />
            {checkoutMutation.isPending ? "Creating order…" : "Open Razorpay Checkout"}
          </button>
          <p
            className={cn(
              "text-[11.5px] leading-4 text-muted-foreground",
              runInFlight && "text-warn",
            )}
          >
            {runInFlight
              ? "A run is already in progress. Starting another opens a separate case."
              : "Takes about 5–15 seconds. You can watch each step as it happens."}
          </p>
        </div>
      </form>
    </Panel>
  );
}
