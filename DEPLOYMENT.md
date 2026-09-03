# Deploying Revenue Guardian to Vercel

Two Vercel projects, one Git repository. They are deployed separately because
they are different kinds of thing: the dashboard is a TanStack Start app that
Nitro builds into Vercel's output format, and the agent is a Fastify API that
runs as a single serverless function. Keeping them apart means the API can be
redeployed without rebuilding the UI, and the UI never gets a chance to touch a
provider secret.

| | Root directory | What it is | Public URL |
|---|---|---|---|
| Frontend | `./` | TanStack Start dashboard | `https://<frontend>.vercel.app` |
| Backend | `backend/` | Fastify recovery agent | `https://<backend>.vercel.app` |

There is a small ordering problem: the frontend needs the backend's URL at build
time, and the backend wants the frontend's origin for its CORS allowlist. The
sequence below resolves it — deploy the backend first with CORS open, then the
frontend, then close CORS and redeploy the backend.

---

## Before you start

You need a Postgres database (this project uses Supabase), Razorpay API keys, and
at least one outreach channel configured (WhatsApp or SMTP). The agent degrades
honestly without the optional pieces: without a diagnosis model it falls back to
a deterministic classifier, and `/api/system/status` reports exactly which
integrations are missing so the UI can warn instead of pretending.

Run the local checks first. A build that fails on Vercel after twelve minutes of
queueing is a worse way to learn about a type error.

```bash
npm install
npm run build                      # frontend
npm --prefix backend install
npm --prefix backend run typecheck # includes the test suite
npm --prefix backend run build     # excludes it
npm --prefix backend test          # 25 tests
```

---

## 1. Database

Supabase gives you two connection strings, and which one you use matters more
here than it does locally.

**Pooled** (Project Settings → Database → Connection pooling, Transaction mode,
port 6543) is what the deployed backend must use. Every serverless invocation
constructs its own Prisma client; against the direct connection they exhaust
Postgres' connection slots and the API starts returning errors that never appear
in development.

```
postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

**Direct** (port 5432) is what migrations need, because pgBouncer in transaction
mode cannot run the DDL Prisma emits. Apply the schema once from your own
machine, pointing `DATABASE_URL` at the direct connection for that command only:

```bash
cd backend
DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres" \
  npx prisma migrate deploy
```

On Windows PowerShell:

```powershell
cd backend
$env:DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"
npx prisma migrate deploy
```

Vercel does not run migrations for you. `vercel-build` runs `prisma generate`,
which produces the client; it deliberately does not run `migrate deploy`, because
a build that silently alters a production schema is a bad thing to own.

---

## 2. Backend project

Create a new Vercel project from this repository and set **Root Directory** to
`backend`. Everything else comes from `backend/vercel.json`: the build command,
the single function, the catch-all rewrite, and the cron schedule. Leave the
framework preset as "Other".

Set these environment variables (Settings → Environment Variables). Apply them to
Production and Preview both, or previews will boot without a database.

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | The **pooled** Supabase string from step 1 |
| `RAZORPAY_KEY_ID` | yes | `rzp_test_…` unless you mean real money |
| `RAZORPAY_KEY_SECRET` | yes | From the Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | yes | Set in step 5 |
| `CRON_SECRET` | yes | `openssl rand -hex 32` — scheduled retries stay off without it |
| `APP_BASE_URL` | yes | This backend's own URL, e.g. `https://revenue-guardian-api.vercel.app` |
| `CORS_ALLOWED_ORIGINS` | later | Leave empty for now; set in step 4 |
| `WHATSAPP_SEND_API_KEY` | one of | Primary WhatsApp sender |
| `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` | one of | Meta Cloud API fallback |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_USE_TLS` | one of | Email channel; Gmail needs an App Password |
| `POLLINATIONS_API_KEY` | no | Omit to use the deterministic classifier |
| `DEMO_ENDPOINTS_ENABLED` | no | `false` to switch off the bulk data generator |
| `MAX_RETRY_ATTEMPTS`, `MAX_OUTREACH_ATTEMPTS`, `COOLDOWN_HOURS`, `MINIMUM_RECOVERY_VALUE`, `HIGH_VALUE_THRESHOLD`, `LOW_CONFIDENCE_THRESHOLD` | no | Starting policy limits; the Settings page overrides them once saved |

`PORT` is ignored — Vercel supplies its own.

Deploy, then check it answers:

```bash
curl https://<backend>.vercel.app/health
# {"ok":true,"service":"revenue-recovery-agent"}

curl https://<backend>.vercel.app/api/system/status
# database, integrations, razorpayMode, limits — booleans and labels only
```

If `database` is `false`, the connection string is wrong or the pooler is
refusing it. That one field is worth checking before anything else, because
almost every other symptom follows from it.

---

## 3. Frontend project

Create a second Vercel project from the same repository, leaving **Root
Directory** at the repository root. `vercel.json` sets `NITRO_PRESET=vercel` for
the build and pins the installer to npm — the repo also carries a `bun.lock`, and
without that pin Vercel may pick bun and resolve a different tree.

One variable matters:

| Variable | Required | Value |
|---|---|---|
| `VITE_API_BASE_URL` | yes | `https://<backend>.vercel.app`, no trailing slash |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | no | Only if you add server functions that need a Supabase session |

`VITE_API_BASE_URL` is read at **build** time and baked into the bundle, so
changing it needs a redeploy, not just a restart. A build made without it points
at `http://localhost:3000`; rather than fail mysteriously, the app logs the
missing variable by name to the console and says so in its error messages.

No provider secret belongs in this project. Not `RAZORPAY_KEY_SECRET`, not
`RAZORPAY_WEBHOOK_SECRET`, not `POLLINATIONS_API_KEY`, not
`WHATSAPP_ACCESS_TOKEN`, not `SMTP_PASSWORD`. Anything prefixed `VITE_` is
compiled into JavaScript that every visitor can read.

---

## 4. Close CORS

Now that both URLs exist, go back to the backend project and set:

```
CORS_ALLOWED_ORIGINS=https://<frontend>.vercel.app
ALLOW_VERCEL_PREVIEW_ORIGINS=true      # optional, lets preview builds through
```

Redeploy the backend. Until you do this the API answers
`Access-Control-Allow-Origin: *`, which means any page on the internet can drive
the Test Agent and demo endpoints from a visitor's browser — and those endpoints
send real WhatsApp messages and real email.

Requests without an `Origin` header are unaffected, so the Razorpay webhook and
Vercel Cron keep working after the allowlist is in place.

---

## 5. Razorpay webhook

In the Razorpay dashboard, under Settings → Webhooks, add:

```
https://<backend>.vercel.app/api/webhooks/razorpay
```

Subscribe to `payment.failed` and `payment.captured`. Set a secret, and put the
same value in the backend's `RAZORPAY_WEBHOOK_SECRET`. Signature verification is
computed over the raw request bytes — the content-type parser in
`backend/src/app.ts` keeps the original buffer for exactly this reason — so the
webhook will reject deliveries if the secret does not match, which is the correct
behaviour and also the first thing to check if deliveries start failing.

---

## 6. Scheduled retries

Only one part of the agent needs a clock: the delayed retry. When the policy
engine decides a failed payment deserves another attempt later rather than an
immediate message, it parks the case as `RETRY_PENDING` and stamps
`nextActionAt` — by default thirty minutes out. Something has to come back and
notice that the time has passed. Nothing else does: a webhook arriving, or a
Test Agent run, completes diagnosis, policy, payment link and outreach
synchronously inside the one request.

Locally, `startRetryScheduler()` polls every thirty seconds. That cannot work on
Vercel: the moment a function returns a response it is frozen, and any timer with
it. So the same tick is driven from outside, over HTTP:

```bash
curl -X POST https://<backend>.vercel.app/api/cron/retry-tick \
  -H "Authorization: Bearer $CRON_SECRET"
# {"ok":true,"processed":0,"ranAt":"…"}
```

The endpoint accepts `GET` and `POST` and requires
`Authorization: Bearer $CRON_SECRET`. On a deployment where `CRON_SECRET` is not
set it returns 503, rather than leaving an unauthenticated trigger for real
outreach exposed on the internet. Because the reservation inside
`processRetry` is atomic, calling it twice at once is harmless — which is what
makes the endpoint safe to point several schedulers at.

Anything that can make an authenticated HTTP request will do. Two are wired up:

**Vercel Cron**, from the `crons` block in `backend/vercel.json`, which attaches
the bearer token automatically. The committed schedule is `0 3 * * *` — once a
day at 03:00 UTC — and that is a plan limit, not a preference. **Vercel's Hobby
plan rejects any expression more frequent than daily at deploy time**, with
`Hobby accounts are limited to daily cron jobs`, and Hobby scheduling is only
accurate to the hour anyway. On Pro, change it and delete the workflow below:

```json
"crons": [{ "path": "/api/cron/retry-tick", "schedule": "*/5 * * * *" }]
```

**GitHub Actions**, in `.github/workflows/retry-tick.yml`, which runs every five
minutes on any plan. It is inert until you add two repository secrets under
Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `RETRY_TICK_URL` | `https://<backend>.vercel.app/api/cron/retry-tick` |
| `CRON_SECRET` | The same value you set in the backend's Vercel environment |

Without them every run exits successfully with a notice, so an unconfigured fork
does not generate failure mail. Two honest caveats: GitHub queues scheduled
workflows and may run them minutes late or skip them under load, and it disables
schedules in a public repository after 60 days without a commit. Neither matters
much here — a retry that fires at 34 minutes instead of 30 is still a retry — but
it is why the daily Vercel cron is left in place as a backstop.

On a Hobby plan with no external scheduler, retries still happen; they just wait
for the nightly tick. Nothing is lost, because `nextActionAt` lives in the
database and the query picks up everything already due.

---

## Verify the deployment

Work through the judge flow, because it exercises nearly everything:

1. Open the frontend. The header health indicator should be green — that is a
   live read of `/api/system/status` on the backend, so it proves CORS,
   the API and the database at once.
2. Go to **Test Agent**, pick a scenario, enter a phone number or email you
   control, tick the consent box, and run it. A real message is sent.
3. Watch the run panel. Every step it shows is read back from the case's audit
   trail; nothing is asserted by the frontend.
4. Open the created case from **Recovery Cases** and confirm the payment link,
   the diagnosis and the outreach record are all there.
5. Pay the link (test mode) and confirm the case moves to recovered once the
   `payment.captured` webhook lands.

---

## What is different about running serverless

Three things behave less well on Vercel than on a long-running server, and it is
better to know them than to discover them.

**The Test Agent's own rate limit is weaker.** `backend/src/routes/testAgent.ts`
tracks recent runs per contact in an in-memory `Map`. That map does not survive
between invocations, so the per-contact and global caps only hold within a warm
instance. The database-backed caps — `MAX_OUTREACH_ATTEMPTS` and
`MAX_RETRY_ATTEMPTS` per case — are unaffected and still bound the number of
messages any single case can produce. If you need the page-level limit to hold
strictly, it has to move into the database.

**Run progress falls back to the database.** The same file keeps a `Map` of
in-flight runs. When an invocation is recycled mid-run the status endpoint no
longer finds the record, and it already handles this: it reads the case's status
from the database and reports the run as finished if the case reached a terminal
state. You may see a run's live step list reset while its recorded outcome stays
correct.

**Cold starts add latency.** The first request after idle builds the Fastify
instance and connects Prisma. The function is configured with 1024 MB and a 60
second `maxDuration`, which is comfortable for a full pipeline run — diagnosis,
payment link creation, and an outreach send with fallback — but the first one
will feel slow.

---

## Before you make it public

- Rotate the Razorpay keys. Earlier versions of this repository committed a
  `.env`, so the old keys should be considered compromised regardless of what
  the working tree looks like now. Rotating is the only fix; removing the file
  is not.
- Keep `rzp_test_` keys unless you intend real money to move. The status
  endpoint reports the mode, and the UI shows it.
- Set `CORS_ALLOWED_ORIGINS` (step 4).
- Set `DEMO_ENDPOINTS_ENABLED=false` unless you need the bulk generator.
  `/api/demo/generate-batch` is unauthenticated and will run the real pipeline up
  to 200 times in one request, sending real messages to the plausible-looking
  Indian mobile numbers in its scenario list. The Test Agent page is unaffected
  and remains the intended way to demonstrate a case.
- Confirm `CRON_SECRET` is set, or scheduled retries stay off.

---

## Troubleshooting

**Everything under `/api/test-agent/` or `/api/system/` returns 404.** This was a
real bug: `backend/src/vercel.ts` used to keep its own list of route
registrations, fell behind `server.ts`, and shipped a production build missing
both route groups. Registration now lives only in `backend/src/app.ts`. If you
add a route file, add it to `registerRoutes` there — a route registered in
`server.ts` will work locally and 404 in production.

**`Query engine library for current platform could not be found`.**
`prisma/schema.prisma` declares `binaryTargets = ["native", "rhel-openssl-3.0.x"]`
for the Vercel Node runtime, and `vercel.json` lists the Prisma directories in
`includeFiles`. If it still happens, redeploy without the build cache — a cached
`node_modules` from before the `binaryTargets` change will not contain the engine.

**`too many connections` from Postgres.** `DATABASE_URL` is the direct connection
rather than the pooled one. Use port 6543 with `?pgbouncer=true&connection_limit=1`.

**`prisma migrate deploy` hangs or errors on the pooled URL.** Expected —
pgBouncer cannot run Prisma's DDL in transaction mode. Use the direct connection
for migrations only (step 1).

**The dashboard loads but every panel fails.** Open the browser console. If it
names `VITE_API_BASE_URL`, the frontend was built without it; set it and
redeploy. If requests are being made to the right host but blocked, the backend's
`CORS_ALLOWED_ORIGINS` does not include the frontend's exact origin — scheme
included, trailing slash excluded.

**The deploy fails with `Hobby accounts are limited to daily cron jobs`.** The
`schedule` in `backend/vercel.json` is more frequent than once a day. Hobby
rejects those at build time, before anything is deployed. Put it back to
`0 3 * * *` and use the GitHub Actions workflow if you need retries to fire
sooner than nightly (step 6).

**The build picks bun and resolves differently.** `vercel.json` pins
`installCommand` to `npm install` in both projects. If you removed that, the
`bun.lock` in the repository root will be preferred.

---

## Files that exist for deployment

| File | Why |
|---|---|
| `vercel.json` | Frontend project: `NITRO_PRESET=vercel`, npm pinned |
| `.env.example` | Frontend variables, with the secrets that must never appear there named explicitly |
| `backend/vercel.json` | Function config, catch-all rewrite, daily cron schedule |
| `.github/workflows/retry-tick.yml` | Optional five-minute retry tick, for plans where Vercel Cron cannot go sub-daily |
| `backend/api/index.js` | Vercel's function entry; re-exports the compiled handler |
| `backend/public/index.html` | Something honest at the API root instead of a directory listing |
| `backend/tsconfig.build.json` | Build scope without `src/tests`, so the test suite is not bundled into the function |
| `backend/src/app.ts` | The single place routes are registered, shared by both entry points |
| `backend/src/vercel.ts` | Serverless entry: builds once per cold start, no scheduler |
| `backend/src/server.ts` | Local entry: binds a port, runs the interval scheduler |
| `backend/src/routes/cron.ts` | Authenticated retry tick for Vercel Cron |
| `backend/.env.example` | Backend variables, scrubbed of the real values it used to carry |
