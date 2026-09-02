# Razorpay Revenue Recovery Agent MVP

## Goal
Build a runnable, auditable MVP for intelligent Razorpay failed-payment recovery: verified and idempotent webhook intake, database-backed context, validated LLM recommendation, deterministic policy approval, bounded side effects, capture verification, and a revenue-focused dashboard.

## Product decisions
- Preserve the existing TanStack Start frontend because it is the supported stack in this repository; implement the requested dashboard routes with TanStack Router rather than introducing Next.js or a second frontend runtime.
- Add a separate Node.js + TypeScript Fastify service under `backend/`, backed by Lovable Cloud PostgreSQL through Prisma. All secrets and provider calls remain server-side.
- Keep the real webhook and demo endpoint on the same recovery pipeline. Demo endpoints will use clearly marked synthetic records and deterministic provider fallbacks when credentials are unavailable, while production payment links/messages will never be fabricated.
- Use a small, testable service layer: persistence, context, diagnosis/scoring, policy, executor, notifications, verification, audit, and metrics.

## Implementation phases
1. **Foundation and data model**
   - Add backend package/configuration, Fastify bootstrap, raw-body support, Zod validation, Prisma client, environment example, Docker PostgreSQL configuration, migrations, enums, indexes, unique constraints, and grants/policies appropriate for the connected Cloud database.
   - Add root scripts/documentation for starting backend, frontend, database, migrations, and tests.

2. **Vertical recovery slice**
   - Implement Razorpay signature verification over the untouched request body and event-id idempotency.
   - Implement `payment.failed`, `payment.captured`, and `order.paid` handling with customer/order/payment upserts, recovery-case creation, current-state checks, and pending-action cancellation.
   - Build customer/payment/history context, OpenAI structured diagnosis with Zod validation, one retry plus conservative deterministic fallback, deterministic opportunity score, expected recovery value, policy rules, payment-link creation, WhatsApp sender, SMTP email, notification fallback, and audit timeline.
   - Ensure every action reloads state before side effects and cannot run twice for a case/action.

3. **Boundaries and operations**
   - Add stopping rules, escalation records/audit data, manual stop/escalate endpoints, retry/outreach limits, cooldown scheduling, a lightweight scheduler, and metrics computed from persisted records.
   - Add recovery cases/detail, dashboard metrics/activity, settings persistence, demo failure/capture, and batch generation endpoints. Batch scenarios will run through the same pipeline and persist modeled outcomes without hardcoded dashboard totals.

4. **Frontend experience**
   - Replace the placeholder home route with the dashboard and add `/recovery`, `/recovery/$id`, `/escalations`, and `/settings` routes.
   - Build responsive navigation, metric cards, case table/detail timeline, human-review queue, policy settings, demo controls, loading/error/empty states, and API-backed refresh/mutations. Keep customer-facing content free of internal risk/policy details.
   - Add unique route-level metadata for each content route and update the root metadata away from template values.

5. **Verification and polish**
   - Add automated tests for the ten required scenarios: happy-path recovery, expired method, transient retry, high-risk escalation, duplicate webhook, capture cancellation, WhatsApp-to-email fallback, LLM fallback, retry stop, and outreach stop.
   - Exercise demo flows and dashboard data end-to-end, check webhook security/idempotency and secret-safe logging, resolve build/runtime diagnostics, and finish the README with architecture, setup, configuration, local test-mode disclaimer, demo steps, and limitations.

## Core flow
```text
Razorpay webhook -> raw signature check -> event idempotency -> persisted event
  -> payment/customer/order upsert -> recovery context -> validated LLM recommendation
  -> score/value -> deterministic policy -> guarded action executor
  -> Razorpay link/retry/escalation -> WhatsApp/email fallback
  -> captured/paid event -> recovered case -> cancel pending actions -> metrics
```

## Technical details
- Prisma models will represent Customer, Order, Payment, WebhookEvent, RecoveryCase, RecoveryAction, AuditLog, plus the minimum persisted merchant-policy/escalation data needed by the settings and review flows.
- The LLM can recommend only the declared diagnosis/action/channel schema; the backend injects authoritative order, amount, and payment-link values into outbound messages.
- The policy engine is authoritative for risk, confidence, economic-value, retry, outreach, recovered-state, and escalation rules. It will use configurable thresholds rather than scattered constants.
- Real Razorpay/WhatsApp/SMTP/OpenAI calls are enabled by environment variables; missing optional provider credentials keep the app operational through safe failure/fallback paths and auditable outcomes.
- The frontend will call the Fastify API through a configurable server-side-safe API base URL; no private environment values will be exposed to browser code.
