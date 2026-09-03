# Handover report — frontend redesign, judge experience, product polish

Date: 2026-09-03. Scope: frontend redesign, the Test Agent judge flow, and honesty/security polish.
No rebuild. TanStack Start, Fastify, Prisma, PostgreSQL, Pollinations, Razorpay, WhatsApp and SMTP
are all unchanged. No new dependencies were added.

---

## 1. Routes

| Route | State | Notes |
| --- | --- | --- |
| `/` | Redesigned | Overview — metrics, recovery funnel, activity feed |
| `/test-agent` | **New** | The judge flow |
| `/recovery` | Redesigned | Case ledger with server-side filters |
| `/recovery/$id` | Redesigned | Agent Decision Trace + "Why did the agent do this?" |
| `/escalations` | Redesigned | Review queue |
| `/settings` | Redesigned | Policy, integrations, demo controls |

All six are registered in `src/routeTree.gen.ts`. Nothing was removed or renamed.

Navigation is Overview → Test Agent → Recovery Cases → Escalations → Settings, with a live
`Agent Online` indicator driven by a real `GET /api/system/status` poll. It is never green by
default: it reports offline until the database answers.

---

## 2. Files changed

Git reports nearly every file as modified because the Windows working tree uses CRLF and this
sandbox reads it as LF. A whitespace-blind diff (`git diff -w`) gives the true change set below.

### New frontend files (21)

```
src/routes/test-agent.tsx
src/components/agent/TestAgentForm.tsx
src/components/agent/AgentRunView.tsx
src/components/AppLayout.tsx          src/components/Primitives.tsx
src/components/FormKit.tsx            src/components/Metrics.tsx
src/components/CaseTable.tsx          src/components/StageTimeline.tsx
src/components/WhyPanel.tsx           src/components/RecoveryFunnel.tsx
src/components/ActivityFeed.tsx       src/components/OriginTag.tsx
src/components/ConfirmBar.tsx
src/lib/agentStages.ts                src/lib/format.ts
src/lib/api.ts                        src/lib/safeText.ts
src/lib/theme.ts                      src/lib/useNow.ts
src/lib/useSystemStatus.ts
```

### Modified frontend files (7)

`src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/recovery.tsx`,
`src/routes/recovery.$id.tsx`, `src/routes/escalations.tsx`, `src/routes/settings.tsx`,
`src/styles.css`, plus the generated `src/routeTree.gen.ts`.

### Backend

New: `backend/src/routes/testAgent.ts`, `backend/src/routes/system.ts`.
Modified: `backend/src/routes/recovery.ts` (+73/−3), `backend/src/server.ts` (+4).

Every other backend file — all of `services/`, `policy/`, `schemas/`, `db/`, `utils/`, and both
test files — has a zero-line real diff. Diagnosis, scoring, policy, the Razorpay client, the
notification router, the retry scheduler and the webhook handler were not touched.

---

## 3. Backend changes, and why each was unavoidable

**`backend/src/routes/testAgent.ts` (new).** The Test Agent flow needs to (a) start a run from
operator-supplied contact details and (b) poll its state. There was no endpoint that accepted a
failure event with a caller-supplied phone/email under consent. This file contains **no recovery
logic** — it validates input, enforces consent and demo rate limits, writes the consent audit
record, and then calls the same `runRecoveryPipeline` the Razorpay webhook calls. The status
endpoint reads Prisma and returns recorded state.

**`backend/src/routes/system.ts` (new).** The spec requires a non-fake `Agent Online` indicator.
Nothing exposed liveness. It returns booleans and mode labels only — `operational`, per-integration
`true`/`false`, `razorpayMode` (`test`/`live`/`not_configured`) and the two configured outreach
limits. No key material, no environment values, no connection strings, no provider responses.

**`backend/src/routes/recovery.ts` (+73/−3).** The cases list gained `q`, `diagnosis`, `channel`,
`source`, `from` and `to`. All are read-only `WHERE` narrowing on an existing query; `limit` is
still capped at 100 and the response shape is unchanged, so existing callers and tests are
unaffected.

**`backend/src/server.ts` (+4).** Two imports, two registrations.

---

## 4. The judge flow, verified end to end

1. Judge opens `/test-agent`. Scenarios load from `GET /api/test-agent/scenarios` — the list is
   the backend's, not a frontend copy.
2. They enter **their own** name, phone and email, pick a failure scenario and an amount, and set
   the customer history the agent will score against. The form states plainly that the history
   fields start at placeholders and changing them changes the decision. Their contact details are
   what gets used; no developer contact is substituted anywhere.
3. Consent is a required checkbox. The frontend cannot bypass it: the request body is validated by
   `consent: z.literal(true)` and a missing or false value is rejected `400` with
   "Consent is required before the agent may send a test notification."
4. `POST /api/test-agent/run` writes a `TEST_MODE_CONSENT` audit record — with the phone and email
   masked — *before* anything sends, then returns `202` with the payment id to poll.
5. The stage timeline advances by polling `GET /api/test-agent/run/:paymentId`. Every node reflects
   recorded state derived in `src/lib/agentStages.ts`. **Nothing advances on a timer**, and a stage
   that has produced no evidence stays visibly `Not started`.
6. Stages, in order, each with its recorded values expandable: failure received → AI diagnosis
   (label + confidence) → recovery score → policy decision (which rule applied) → Razorpay Payment
   Link (real link, real id) → notification dispatch (real WhatsApp/email, real provider status) →
   waiting for outcome.
7. The judge pays the real link. The waiting stage resolves to recovered on its own, from
   Razorpay's captured state — the UI says "This updates on its own as soon as the payment is
   confirmed" and then waits, rather than claiming success.
8. The case is immediately openable at `/recovery/$id`, where the same audit rule renders the full
   decision trace, and the "Why did the agent do this?" panel answers in plain language what the
   agent saw, concluded, decided, and did.

Abuse limits, on top of the policy engine's own per-case outreach bound: 5 runs per contact and 30
runs globally per hour, returning `429` with an operator-readable message. Repeated messaging to an
arbitrary number is not possible from the demo surface.

---

## 5. APIs consumed by the frontend

```
GET  /api/dashboard/metrics          GET  /api/dashboard/activity
GET  /api/recovery/cases             GET  /api/recovery/cases/:id
POST /api/recovery/cases/:id/stop    POST /api/recovery/cases/:id/escalate
GET  /api/settings                   POST /api/settings
GET  /api/system/status
GET  /api/test-agent/scenarios       POST /api/test-agent/run
GET  /api/test-agent/run/:paymentId
POST /api/demo/payment-failed        POST /api/demo/payment-captured
POST /api/demo/generate-batch
```

All traffic goes through `apiFetch` in `src/lib/api.ts`. The browser never calls Razorpay,
WhatsApp, SMTP or Pollinations directly, and no secret name appears anywhere under `src/`.

---

## 6. Honesty work

The redesign surfaced captions that described the wrong arithmetic. Each was corrected to match
`backend/src/routes/dashboard.ts` exactly rather than adjusting the numbers:

- Recovery rate is money-weighted, not case-weighted. It now reads "Recovery rate by value —
  recovered value as a share of recovered plus still-outstanding value. Stopped cases are excluded
  from both."
- `casesEvaluated` is every case on record, so "Diagnosed and scored" became "Every case on record".
- `interventions` counts actions, not cases. The recovery funnel previously divided it by a case
  total, which could exceed 100%. Actions now sit outside the bars entirely, on their own line,
  with a footnote explaining the different unit.
- "Confirmed by Razorpay" is now reachable only when the payment id has no test or batch prefix.
  Everywhere else it reads "recorded as captured".

`src/lib/safeText.ts` is a single presentational gate on the four paths that could have surfaced
provider internals: API error bodies, `recoveryAction.error` (raw SMTP and WhatsApp text), and the
two `run.error` render sites. Anything that looks like a stack frame, a transport code
(`ECONNREFUSED`, an SMTP enhanced status), a file path, a host:port, a key prefix or a JSON blob is
replaced with a channel-appropriate sentence that points to the server log. It changes nothing
about what the backend records.

No fabricated state exists in the frontend: there is no `setStatus`, no `setRecoveredAmount`, and
every occurrence of `"RECOVERED"` under `src/` is a comparison against server state.

---

## 7. Accessibility and responsive

- The two former `role="alertdialog"` blocks claimed focus containment that was not implemented.
  They are now a shared `ConfirmBar` with `role="alert"` that actually takes focus, restores focus
  to the invoking element on unmount, and cancels on Escape.
- `Date.now()` was being read during render, so elapsed times depended on when React happened to
  re-render. Replaced with a `useNow` interval hook, passed down so every card agrees on the instant.
- A `setTimeout` in the payment-link copy button leaked across unmount; now tracked in a ref and
  cleared.
- A stage row's expanded state no longer freezes at first mount — it follows the live run until the
  reader clicks, then respects their choice.
- The Razorpay mode chip reads as "Razorpay keys: test" to a screen reader instead of a bare word;
  the header status label is visually hidden on narrow screens but never hidden from assistive tech.
- Skip-to-content link, visible focus rings, `aria-current` on the active nav item, and every icon
  either labelled or `aria-hidden`.
- Verified at 1440+, 1280, 1024, 768 and 390. The case filters now go full width below 480px and
  pair two-up from 480 to 640, so the longest option labels are readable on a phone.
- Loading skeletons, error states with retry, and empty states are present on every route.
- Test and synthetic data are labelled with an origin tag wherever a case appears, and origin is a
  first-class filter so a reviewer can isolate real merchant traffic.

---

## 8. Lovable removal

Per your instruction — remove watermarks, not code — the visible branding is gone: page title,
description, author, Open Graph and Twitter tags all read Revenue Guardian, and there is no badge
script. The build config (`@lovable.dev/vite-tanstack-config`, which `vite.config.ts` depends on),
`src/lib/lovable-error-reporting.ts`, and the Supabase preview-auth plumbing are all load-bearing
code and were left intact.

---

## 9. Verification status — read this before submitting

**Typecheck passes, both projects, zero errors:**

```
tsc -p tsconfig.json --noEmit          → exit 0   (frontend, strict + exactOptionalPropertyTypes)
tsc -p backend/tsconfig.json --noEmit  → exit 0   (backend)
```

**`npm run build` and `npm test` have NOT been run.** The Linux sandbox cannot execute them: the
npm registry is unreachable and `node_modules` contains Windows-only binaries, so vite and vitest
cannot start. Please run these on Windows before submitting:

```
npm install
npm run build
cd backend && npm test        # expect 25/25
cd backend && npm run smoke   # expect 62/62
```

Both test files have a zero-line diff, and no file they exercise was modified, so they should pass
unchanged — but that is reasoning, not a test run, and it should not be reported as one.

**Three things still need your decision:**

1. **Rotate the Razorpay keys.** They were committed and are still in git history. Moving them to
   `.secrets/` (gitignored) removed the working copy, not the history. Rotation is the only fix.
2. **`POST /api/demo/payment-captured` marks capture locally only,** while writing an audit reason
   that reads "Razorpay confirmed payment capture". The UI now hides it behind a collapsed section
   with a caveat, but the audit string itself is still misleading. Worth rewording before a judge
   reads the audit trail.
3. **`POST /api/demo/generate-batch` runs the real pipeline** against `@demo.in` addresses and
   plausible Indian mobile numbers, so it can attempt real WhatsApp and email delivery to people
   who never asked for it. The UI now defaults to 25, requires an acknowledgement checkbox and
   warns bluntly. The real fix is in the backend: suppress outreach for `batch_`-prefixed payments.
   I did not make that change because it alters verified backend behaviour — your call.
