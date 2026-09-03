# Revenue Guardian AI — Razorpay Revenue Recovery Agent

An autonomous AI agent that detects failed Razorpay payments, diagnoses the failure, decides on a recovery action, executes it (payment link + WhatsApp/Email), and marks the case recovered when payment is captured.

---

## Product Goal

When a payment fails, most revenue is never recovered. This system closes that gap by:

1. **Observing** Razorpay `payment.failed` events via signed webhook
2. **Understanding** the failure using Pollinations AI (Gemini-fast) with structured output
3. **Prioritizing** cases by Recovery Opportunity Score + Expected Recovery Value
4. **Deciding** via a deterministic Policy Engine (LLM only recommends; policy is authoritative)
5. **Acting** with bounded actions: Razorpay payment link, retry scheduling, or escalation
6. **Notifying** the customer via WhatsApp (preferred) or SMTP Email fallback
7. **Verifying** recovery when `payment.captured` or `order.paid` arrives
8. **Stopping** automatically when limits are reached, payment is captured, or risk is too high

---

## Architecture

```
Razorpay payment.failed
    │
    ▼
Fastify Webhook (POST /api/webhooks/razorpay)
    │ raw body → HMAC-SHA256 signature verify
    │ event ID idempotency (WebhookEvent table)
    │ persist raw payload
    ▼
Recovery Pipeline (recoveryPipeline.ts)
    │ upsert Customer / Order / Payment
    │ create RecoveryCase
    │ build context (customer history, LTV, prior recoveries)
    ▼
Pollinations AI (aiService.ts)
    │ POST https://gen.pollinations.ai/v1/chat/completions
    │ model: gemini-fast (configurable via POLLINATIONS_MODEL)
    │ temperature: 0.2
    │ Zod-validated structured output (AgentDecision)
    │ 2 attempts → deterministic fallback on failure
    ▼
Recovery Opportunity Score (scoringService.ts)   0–100
Expected Recovery Value = amount × probability − cost
    ▼
Deterministic Policy Engine (recoveryPolicy.ts)
    │ LLM recommendation is ADVISORY only
    │ Policy is AUTHORITATIVE
    │ Checks: payment status, order status, diagnosis, confidence,
    │   score, ERV, retry count, outreach count, customer channels
    ▼
Bounded Action Executor (in recoveryPipeline.ts)
    ├── SEND_PAYMENT_LINK → Razorpay API → persist URL
    ├── REQUEST_PAYMENT_METHOD_UPDATE → payment link + update message
    ├── SCHEDULE_RETRY → set nextActionAt, status=RETRY_PENDING
    ├── SEND_REMINDER → notification only
    ├── ESCALATE → create Escalation record, no auto action
    ├── WAIT → no side effects
    └── STOP → case closed
    ▼
Notification Router (notificationRouter.ts)
    │ Re-checks payment status before EVERY send (race-condition guard)
    ├── WhatsApp Cloud API (preferred)
    └── SMTP Email fallback
    ▼
Retry Scheduler (retryScheduler.ts)
    │ polls every 30s for RETRY_PENDING cases with nextActionAt <= now
    │ atomic reservation (PENDING → EXECUTING) prevents double execution
    │ re-checks payment/case status before acting
    ▼
payment.captured / order.paid webhook
    │ Payment.status = captured
    │ RecoveryCase.status = RECOVERED
    │ RecoveryAction pending = CANCELLED
    │ AuditLog: PAYMENT_CAPTURED + RECOVERY_COMPLETED
    ▼
Dashboard (/) — live metrics from DB
```

---

## AI Provider: Pollinations

- **Endpoint:** `https://gen.pollinations.ai/v1/chat/completions`
- **Model:** configured via `POLLINATIONS_MODEL` (default: `openai` — GPT-5.4 Nano, Quest tier)
- **Temperature:** 0.2 (financial decisioning — low randomness)
- **Auth:** `Authorization: Bearer $POLLINATIONS_API_KEY`
- **Output:** OpenAI-compatible — `choices[0].message.content` parsed as JSON
- **Validation:** Zod schema (`AgentDecision`)
- **Retry:** 2 attempts, then deterministic fallback
- **Fallback:** error-reason-based deterministic decision — never risky autonomous action

The LLM **only recommends**. It never calls Razorpay, sends messages, or modifies the database.

---

## Recovery Opportunity Score

Deterministic, 0–100:

| Signal | Points |
|---|---|
| Amount ≥ high-value threshold | +25 |
| Repeat customer | +20 |
| Recoverable failure type | +20 |
| Recently active | +15 |
| Previous recovery success | +10 |
| Repeated failures | −20 |
| High-risk / fraud | −50 |

Labels: 0–30 LOW · 31–60 MEDIUM · 61–80 HIGH · 81–100 CRITICAL

---

## Expected Recovery Value

```
ERV = paymentAmount × recoverabilityProbability − interventionCost
```

Used by the policy engine to stop cases where recovery is uneconomical.

---

## Policy Engine Rules

| Condition | Decision |
|---|---|
| Payment already captured / order paid | STOP |
| Outreach limit reached | STOP |
| Retry limit reached | STOP |
| HIGH_RISK | ESCALATE |
| ERV < minimum | STOP |
| Low AI confidence (non-transient) | ESCALATE |
| PAYMENT_METHOD_ISSUE | REQUEST_PAYMENT_METHOD_UPDATE (no blind retry) |
| TRANSIENT_FAILURE | SCHEDULE_RETRY |
| SOFT_DECLINE, high-value | SEND_PAYMENT_LINK |
| SOFT_DECLINE, low-value | SCHEDULE_RETRY |
| CUSTOMER_ACTION_REQUIRED | SEND_PAYMENT_LINK |
| HARD_DECLINE / UNKNOWN | ESCALATE |

---

## Stopping Rules

Recovery stops when any of these are true:
- Payment captured / order paid
- Max retries reached
- Max outreach reached
- Case explicitly stopped by merchant
- High-risk escalation
- ERV below threshold
- Case expired

---

## Notification

**WhatsApp** (Meta Cloud API, existing integration — not replaced)
→ fallback to **SMTP Email** (Nodemailer — no third-party transactional API)

Before every notification, the system re-checks payment status. If the payment was captured between scheduling and execution, the notification is suppressed.

Customer messages contain only: name, order ID, amount, payment link. Never internal scores, AI reasoning, or policy details.

---

## Environment Variables

```env
DATABASE_URL=

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

POLLINATIONS_API_KEY=
POLLINATIONS_MODEL=gemini-fast

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=

SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_USE_TLS=true

APP_BASE_URL=http://localhost:3000
PORT=3000

MAX_RETRY_ATTEMPTS=2
MAX_OUTREACH_ATTEMPTS=2
COOLDOWN_HOURS=24
MINIMUM_RECOVERY_VALUE=100
HIGH_VALUE_THRESHOLD=25000
LOW_CONFIDENCE_THRESHOLD=0.60
```

---

## Database Setup

```bash
cd backend
npm install
npx prisma migrate dev --name init
npx prisma generate
```

---

## Running Locally

**Backend:**
```bash
cd backend
npm run dev
```
Runs on port 3000 (configurable via `PORT`).

**Frontend:**
```bash
npm run dev
```
Runs on port 5173 (Vite).

---

## Running Tests

```bash
cd backend
npm test
```

Requires `DATABASE_URL` to be set. Tests mock all external HTTP (Pollinations, WhatsApp, Razorpay, SMTP).

---

## Demo Endpoints

```bash
# Simulate a failed payment through the full pipeline
POST http://localhost:3000/api/demo/payment-failed
{
  "customer": { "name": "Rahul", "email": "rahul@example.com",
    "phone": "919999999999", "lifetimeValue": 35000,
    "successfulPayments": 8, "failedPayments": 1 },
  "payment": { "paymentId": "pay_demo_001", "orderId": "order_demo_001",
    "amount": 4999, "currency": "INR", "method": "card",
    "errorReason": "insufficient_funds" }
}

# Simulate payment captured → recovery
POST http://localhost:3000/api/demo/payment-captured
{ "paymentId": "pay_demo_001", "amount": 4999 }

# Generate ~100 synthetic cases through the full pipeline
POST http://localhost:3000/api/demo/generate-batch
{ "count": 100 }
```

Demo endpoints use the **exact same pipeline** as real Razorpay webhooks. No duplicated logic.

---

## Dashboard Routes

| Route | Description |
|---|---|
| `/` | KPI dashboard — revenue at risk, recovered, recovery rate |
| `/recovery` | Case table with filters, scores, actions |
| `/recovery/:id` | Full case detail with audit timeline |
| `/escalations` | Escalated cases awaiting human review |
| `/settings` | Policy limits (persisted to DB) |

---

## Known Limitations

- Retry scheduler uses `setInterval` — not persistent across server restarts. Cases with `nextActionAt` in the past will be processed on next server start, but there is no job queue.
- WhatsApp requires a Meta Business Account and approved phone number.
- Pollinations API availability is not guaranteed — the deterministic fallback is always safe but conservative.
- Razorpay test-mode credentials must be used for development. Never use live keys in development.
- No authentication on dashboard API routes — add API key or session auth before production deployment.

---

## Razorpay Test Mode

Use test credentials from the Razorpay Dashboard → Settings → API Keys (Test Mode).

For webhook testing locally, use [ngrok](https://ngrok.com) or similar to expose `POST /api/webhooks/razorpay`.

The webhook secret is set in Razorpay Dashboard → Settings → Webhooks. It must match `RAZORPAY_WEBHOOK_SECRET`.
