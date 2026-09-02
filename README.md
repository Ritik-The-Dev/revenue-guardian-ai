# Revenue Guardian AI

IMPLEMENTATION TASK

Razorpay Buildathon — Track 03: AI Revenue Recovery Agent

Build a working MVP in Node.js + TypeScript

You are the coding agent for this project.

Your job is to build the complete working MVP, not merely create architecture, mock APIs, placeholder screens, or pseudocode.

The final application must accept a Razorpay payment.failed webhook, create a revenue-recovery case, analyze it using an LLM with customer/payment context, calculate a recovery score, select a safe recovery action through a deterministic policy engine, execute the action through Razorpay + WhatsApp/SMTP, observe later Razorpay payment events, and mark the case recovered/stopped/escalated.

The application must be runnable locally and deployable.

1. NON-NEGOTIABLE PRODUCT FLOW

Implement this exact flow:

Razorpay payment.failed
        ↓
POST /api/webhooks/razorpay
        ↓
Verify X-Razorpay-Signature
        ↓
Check webhook idempotency
        ↓
Persist webhook event
        ↓
Create/update Payment
        ↓
Create RecoveryCase
        ↓
Build customer + payment context
        ↓
LLM diagnosis
        ↓
Recovery Opportunity Score
        ↓
Expected Recovery Value
        ↓
Deterministic Policy Engine
        ↓
Approved Action
        ↓
Action Executor
        ↓
Razorpay Payment Link / Retry / Escalation
        ↓
Notification Router
        ↓
WhatsApp OR Email
        ↓
Customer attempts payment
        ↓
Razorpay payment.captured / order.paid
        ↓
Recovery Verifier
        ↓
RECOVERED
        ↓
Cancel remaining recovery actions


The system must NOT be implemented as:

payment.failed → send generic reminder


The purpose is intelligent, bounded revenue recovery.

2. TECHNOLOGY STACK

Use exactly this stack unless there is a strong technical reason to change one component:

Backend

Node.js

TypeScript

Fastify

Prisma

PostgreSQL

Validation

Zod

AI

OpenAI API

Use structured JSON output

Validate every model response with Zod

Razorpay

Razorpay REST API / official Node SDK where appropriate

Email

Node.js nodemailer

Native SMTP

NO SendGrid

NO Resend

NO Mailgun

NO Postmark

NO AWS SES

NO other third-party transactional email provider

WhatsApp

Use the existing WhatsApp Cloud API sender provided later in this prompt.

Frontend

Next.js

React

TypeScript

Tailwind CSS

Scheduling

Use a lightweight scheduler such as node-cron or node-schedule.

Do not introduce Kafka, Redis, Kubernetes, microservices, or other infrastructure unless absolutely required.

3. REQUIRED REPOSITORY STRUCTURE

Create this structure:

backend/
  src/
    server.ts
    config.ts

    routes/
      razorpayWebhook.ts
      recovery.ts
      demo.ts
      dashboard.ts

    agent/
      recoveryAgent.ts
      diagnosis.ts
      prompts.ts

    policy/
      recoveryPolicy.ts
      stoppingRules.ts

    services/
      razorpayService.ts
      paymentLinkService.ts
      customerContextService.ts
      scoringService.ts
      recoveryVerificationService.ts
      notificationRouter.ts
      whatsappService.ts
      emailService.ts
      escalationService.ts
      auditService.ts
      metricsService.ts

    schemas/
      webhookSchemas.ts
      agentSchemas.ts
      recoverySchemas.ts

    db/
      prisma.ts

    utils/
      idempotency.ts
      logger.ts

  prisma/
    schema.prisma
    migrations/

  package.json
  tsconfig.json
  .env.example

frontend/
  app/
  components/
  lib/
  package.json

README.md
docker-compose.yml


Do not create unnecessary abstractions.

4. ENVIRONMENT VARIABLES

Create .env.example:

DATABASE_URL=

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

OPENAI_API_KEY=
OPENAI_MODEL=

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=

SMTP_HOST=
SMTP_PORT=
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_USE_TLS=true

APP_BASE_URL=


Never expose these values to the frontend.

5. DATABASE SCHEMA

Use Prisma.

Create these models.

Customer

Fields:

id
externalCustomerId nullable
name nullable
email nullable
phone nullable
lifetimeValue
successfulPayments
failedPayments
lastSuccessfulPaymentAt nullable
communicationPreference
createdAt
updatedAt


communicationPreference values:

WHATSAPP
EMAIL
BOTH
NONE


Order

Fields:

id
razorpayOrderId unique
customerId
amount
currency
status
createdAt
updatedAt


Payment

Fields:

id
razorpayPaymentId unique
razorpayOrderId nullable
customerId nullable
amount
currency
method nullable
status
errorCode nullable
errorDescription nullable
errorReason nullable
createdAt
updatedAt


WebhookEvent

Fields:

id
razorpayEventId unique
eventType
payloadHash
rawPayload
status
receivedAt
processedAt nullable
createdAt


Allowed processing status:

RECEIVED
PROCESSED
FAILED
DUPLICATE


RecoveryCase

Fields:

id
paymentId
orderId nullable
customerId nullable

status

diagnosis nullable
diagnosisConfidence nullable
recoverabilityProbability nullable

recoveryScore nullable
expectedRecoveryValue nullable

recommendedAction nullable
approvedAction nullable
channel nullable

retryCount
outreachCount

nextActionAt nullable

recoveredAmount nullable
escalationReason nullable
stopReason nullable

createdAt
updatedAt


Case statuses:

NEW
ANALYZING
ACTION_PLANNED
ACTION_EXECUTED
WAITING_FOR_OUTCOME
RETRY_PENDING
RECOVERED
ESCALATED
STOPPED


RecoveryAction

Fields:

id
caseId
action
channel nullable
status
providerMessageId nullable
scheduledFor nullable
executedAt nullable
result nullable
error nullable
createdAt


Action status:

PENDING
EXECUTING
SENT
SUCCESS
FAILED
CANCELLED


AuditLog

Fields:

id
caseId nullable
eventType
decision nullable
reason nullable
metadata JSON
createdAt


6. RAZORPAY WEBHOOK

Create:

POST /api/webhooks/razorpay


Support these events:

payment.failed
payment.captured
order.paid


Use the actual Razorpay webhook payload.

Do not invent a custom payload format for the production webhook.

7. WEBHOOK SIGNATURE VERIFICATION

Before processing any webhook:

Read the raw request body.

Read header X-Razorpay-Signature.

Verify the signature using RAZORPAY_WEBHOOK_SECRET.

Reject invalid signatures with HTTP 401.

Do not process invalid payloads.

Do not stringify/rebuild parsed JSON for signature verification.

Fastify must be configured so the original raw body is available.

8. WEBHOOK IDEMPOTENCY

Read Razorpay event ID from the webhook.

Use a unique constraint:

WebhookEvent.razorpayEventId


Processing logic:

event arrives
     ↓
event ID exists?
     ├── YES → return 200 immediately
     └── NO
          ↓
      persist event
          ↓
      process event


Never send duplicate WhatsApp/email messages because of duplicated webhooks.

Never execute the same recovery action twice for the same case/action.

9. PAYMENT.FAILED PROCESSING

When payment.failed arrives:

Verify signature.

Verify idempotency.

Persist event.

Upsert customer if customer details are available.

Upsert order if available.

Upsert payment.

Create or update RecoveryCase.

Build customer/payment context.

Run AI diagnosis.

Calculate recovery score.

Calculate expected recovery value.

Run policy engine.

If policy allows action, execute it.

Persist the action.

Write audit logs.

Set case to WAITING_FOR_OUTCOME, RETRY_PENDING, ESCALATED, or STOPPED as appropriate.

10. PAYMENT.CAPTURED PROCESSING

When payment.captured arrives:

Find payment by Razorpay payment ID.

Mark Payment = captured.

Find associated RecoveryCase.

Mark RecoveryCase = RECOVERED.

Set recoveredAmount.

Cancel any pending RecoveryAction records for that case.

Prevent any future WhatsApp/email/retry action for the case.

Write an audit log.

Recalculate dashboard metrics.

This is mandatory.

Never continue recovery after successful payment.

11. ORDER.PAID PROCESSING

When order.paid arrives:

Find the related order.

Mark the order as paid.

Resolve any open RecoveryCase for that order.

Mark the case recovered if not already recovered.

Cancel pending recovery actions.

Write audit log.

12. IMPORTANT PAYMENT STATE RULE

Never assume:

payment.failed = final failure


The system must tolerate:

payment.failed
      ↓
payment.captured


and resolve the case correctly.

If a scheduled action is about to execute, it must first check current payment/case state.

13. CUSTOMER CONTEXT SERVICE

Create:

CustomerContextService


It must return:

{
  "customer": {
    "id": "...",
    "name": "...",
    "email": "...",
    "phone": "...",
    "lifetimeValue": 35000,
    "successfulPayments": 8,
    "failedPayments": 1,
    "lastSuccessfulPaymentAt": "..."
  },
  "payment": {
    "paymentId": "...",
    "orderId": "...",
    "amount": 4999,
    "currency": "INR",
    "method": "card",
    "status": "failed",
    "errorCode": "...",
    "errorReason": "insufficient_funds"
  },
  "recoveryHistory": {
    "previousInterventions": 1,
    "previousRecoveries": 1,
    "previousFailures": 0
  }
}


Use real data from the database.

14. LLM RESPONSIBILITY

The LLM does ONLY reasoning/recommendation.

It must NOT:

directly call Razorpay

directly send WhatsApp

directly send email

directly execute retries

directly modify database state

execute arbitrary code

The LLM returns structured JSON.

The backend validates the output.

The policy engine remains authoritative.

15. FAILURE DIAGNOSIS ENUM

Use:

SOFT_DECLINE
TRANSIENT_FAILURE
PAYMENT_METHOD_ISSUE
CUSTOMER_ACTION_REQUIRED
HARD_DECLINE
HIGH_RISK
UNKNOWN


Examples:

insufficient funds
→ SOFT_DECLINE

network/temporary processor failure
→ TRANSIENT_FAILURE

expired card
→ PAYMENT_METHOD_ISSUE

authentication/3DS issue
→ CUSTOMER_ACTION_REQUIRED

repeated unrecoverable decline
→ HARD_DECLINE

fraud/risk-related issue
→ HIGH_RISK


Do not hardcode every possible Razorpay error string into the LLM prompt.

Pass the actual error information and allow the model to classify it.

Use deterministic fallback mappings for common known cases.

16. LLM OUTPUT SCHEMA

Use Zod:

type AgentDecision = {
  diagnosis:
    | "SOFT_DECLINE"
    | "TRANSIENT_FAILURE"
    | "PAYMENT_METHOD_ISSUE"
    | "CUSTOMER_ACTION_REQUIRED"
    | "HARD_DECLINE"
    | "HIGH_RISK"
    | "UNKNOWN";

  confidence: number;

  recoverabilityProbability: number;

  candidateAction:
    | "SEND_PAYMENT_LINK"
    | "REQUEST_PAYMENT_METHOD_UPDATE"
    | "SCHEDULE_RETRY"
    | "SEND_REMINDER"
    | "ESCALATE"
    | "WAIT"
    | "STOP";

  recommendedChannel:
    | "WHATSAPP"
    | "EMAIL"
    | "NONE";

  delayMinutes: number | null;

  reason: string;

  customerMessage: string;
}


Validate:

confidence: 0..1
recoverabilityProbability: 0..1
delayMinutes >= 0 when present


If invalid:

retry once

if still invalid, use deterministic fallback

never execute an unsafe action merely because the model failed

17. LLM PROMPT

The system prompt must instruct the model:

You are a payment revenue recovery decision-support agent.

Your job is to diagnose a failed payment and recommend one bounded recovery action.

You do not execute payments or communication yourself.

Use only the supplied facts.

Never invent customer/payment information.

Prefer the least aggressive effective intervention.

Never recommend an automatic retry for HIGH_RISK cases.

Never recommend retrying an expired payment method.

When payment is already captured/paid, return STOP.

Consider:
- payment amount
- customer lifetime value
- previous successful payments
- previous recovery history
- failure category
- number of previous attempts
- recovery probability
- available communication channel

Return ONLY the required structured JSON.


18. RECOVERY OPPORTUNITY SCORE

Do not train an ML model.

Implement a deterministic score from 0 to 100.

Use this initial formula:

+25  amount >= 25000
+20  repeat customer
+20  soft/recoverable failure
+15  recent customer activity
+10  previous recovery success
-20  repeated recent failures
-50  high-risk/fraud


Clamp to:

0..100


Bands:

0-30   LOW
31-60  MEDIUM
61-80  HIGH
81-100 CRITICAL


Expose the score in the dashboard.

19. EXPECTED RECOVERY VALUE

Calculate:

expectedRecoveryValue =
paymentAmount * recoverabilityProbability - interventionCost


Use configurable intervention costs.

Example defaults:

WhatsApp message = 1
Email = 0.5
Retry = 2
Human escalation = 20


These are internal economic estimates, not customer charges.

Do not display internal intervention costs to customers.

20. POLICY ENGINE

Create:

RecoveryPolicyEngine


This engine receives:

payment state
customer context
LLM diagnosis
recovery score
expected recovery value
retry count
outreach count
communication availability


It returns:

ALLOW
DENY
ESCALATE
STOP


and an approved action.

The LLM recommendation is only a candidate.

21. POLICY RULES

Implement these exact rules.

Rule 1 — Payment already recovered

If:

payment.status = captured
OR order.status = paid


then:

STOP


Rule 2 — High risk

If:

diagnosis = HIGH_RISK


then:

ESCALATE


Never automatically retry.

Rule 3 — Expired payment method

If:

diagnosis = PAYMENT_METHOD_ISSUE


then:

REQUEST_PAYMENT_METHOD_UPDATE


or:

SEND_PAYMENT_LINK


Do not blindly retry the expired method.

Rule 4 — Transient failure

If:

diagnosis = TRANSIENT_FAILURE


then:

SCHEDULE_RETRY


provided:

retryCount < MAX_RETRY_ATTEMPTS


Rule 5 — Soft decline

If:

diagnosis = SOFT_DECLINE


then prefer:

SEND_PAYMENT_LINK


for a valuable customer.

Otherwise:

SCHEDULE_RETRY


provided retry policy permits it.

Rule 6 — Repeated failures

If:

retryCount >= MAX_RETRY_ATTEMPTS


then:

ESCALATE


or:

STOP


based on amount/risk.

Rule 7 — Outreach limit

If:

outreachCount >= MAX_OUTREACH_ATTEMPTS


then:

STOP


Rule 8 — Low economic value

If:

expectedRecoveryValue < MINIMUM_RECOVERY_VALUE


then:

STOP


Rule 9 — Low AI confidence

If:

diagnosisConfidence < 0.60


then:

ESCALATE


unless a safe deterministic fallback exists.

22. CONFIGURATION

Put these into configuration:

MAX_RETRY_ATTEMPTS=2
MAX_OUTREACH_ATTEMPTS=2
COOLDOWN_HOURS=24
MINIMUM_RECOVERY_VALUE=100
HIGH_VALUE_THRESHOLD=25000
LOW_CONFIDENCE_THRESHOLD=0.60


Do not hardcode these throughout the application.

23. ACTION ENUM

Use:

SEND_PAYMENT_LINK
REQUEST_PAYMENT_METHOD_UPDATE
SCHEDULE_RETRY
SEND_REMINDER
ESCALATE
WAIT
STOP


24. ACTION EXECUTOR

Create an ActionExecutor.

Supported methods:

executeSendPaymentLink(caseId)
executePaymentMethodUpdate(caseId)
executeScheduleRetry(caseId, delayMinutes)
executeReminder(caseId)
executeEscalation(caseId)
executeStop(caseId)


Before every action:

Reload the case from DB.

Verify it is still actionable.

Verify payment is not already captured.

Verify action has not already executed.

Check policy.

Execute.

Persist result.

Write audit log.

This protects against race conditions.

25. RAZORPAY PAYMENT LINK

When the approved action requires a payment link:

Create a Razorpay Payment Link.

Associate it with the recovery case.

Save the URL.

Pass the URL to NotificationRouter.

Send through selected channel.

The generated link must be a real Razorpay test-mode payment link where credentials are available.

Do not fake the link in the production flow.

26. WHATSAPP SERVICE

Use the existing WhatsApp Cloud API integration.

Create:

src/services/whatsappService.ts


Adapt the existing sender to the backend service layer.

Use this exact existing implementation as the provider:

export async function sendWhatsAppText(
  toPhone: string,
  body: string
): Promise<{ id?: string; ok: boolean; error?: string }> {
  console.log("Sending WhatsApp text to", toPhone);
  console.log("Message body:", body);

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    console.warn("[whatsapp] missing credentials, skipping send");
    return { ok: false, error: "missing_credentials" };
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone,
        type: "text",
        text: {
          body,
          preview_url: false
        }
      })
    }
  );

  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };

  if (!res.ok) {
    console.error("[whatsapp] send failed", res.status, json);

    return {
      ok: false,
      error: json?.error?.message ?? `http_${res.status}`
    };
  }

  return {
    ok: true,
    id: json.messages?.[0]?.id
  };
}


Do not search for another WhatsApp provider.

Do not replace this with Twilio.

27. EMAIL SERVICE

Implement:

src/services/emailService.ts


Use:

nodemailer


Use SMTP credentials from environment variables.

The service must support:

sendEmail({
  to,
  subject,
  text,
  html?
})


Return:

{
  ok: boolean,
  messageId?: string,
  error?: string
}


Do not use a third-party email API.

28. NOTIFICATION ROUTER

Create:

NotificationRouter


Rules:

If recommended channel is WHATSAPP

and phone exists:

send WhatsApp


If WhatsApp fails and email exists:

fallback to email


If recommended channel is EMAIL

and email exists:

send email


If customer preference is NONE

do not send.

If no communication channel is available

do not attempt delivery.

Every attempt must create a RecoveryAction record.

Do not send WhatsApp and email simultaneously by default.

29. CUSTOMER MESSAGE

The LLM may generate the customer-facing message, but the backend MUST inject authoritative values such as:

order ID

amount

payment link

Do not allow the model to invent these values.

Example WhatsApp:

Hi Rahul,

Your payment of ₹4,999 for Order #1234 could not be completed.

You can securely complete your payment here:

<RAZORPAY_PAYMENT_LINK>

If you already completed the payment, you can ignore this message.


Do not include:

internal risk score

churn probability

AI reasoning

fraud classification

policy decisions

30. STOPPING RULES

Create:

StoppingRules


Immediately stop when:

payment captured
order paid
maximum retries reached
maximum outreach reached
customer opted out
case already closed
high-risk escalation required
case expired
expected recovery value too low


Store the exact stop reason.

31. ESCALATION

Create:

Escalated


An escalation must store:

amount
customer
failure
diagnosis
confidence
previous actions
reason
recommended next step


Create dashboard view:

Human Review Required


No automatic retry after escalation unless a human action endpoint explicitly reopens the case.

32. AUDIT LOGGING

Every meaningful event must create an AuditLog.

At minimum:

PAYMENT_FAILED
CASE_CREATED
AI_DIAGNOSIS
POLICY_DECISION
ACTION_APPROVED
ACTION_DENIED
WHATSAPP_SENT
EMAIL_SENT
ACTION_FAILED
RETRY_SCHEDULED
ESCALATED
PAYMENT_CAPTURED
RECOVERY_COMPLETED
RECOVERY_STOPPED


Store the reason and relevant metadata.

33. API ENDPOINTS

Implement these endpoints.

Webhook

POST /api/webhooks/razorpay


List recovery cases

GET /api/recovery/cases


Query parameters:

status
page
limit


Case detail

GET /api/recovery/cases/:id


Escalate

POST /api/recovery/cases/:id/escalate


Stop

POST /api/recovery/cases/:id/stop


Dashboard metrics

GET /api/dashboard/metrics


Agent activity

GET /api/dashboard/activity


Demo failure

POST /api/demo/payment-failed


Demo capture

POST /api/demo/payment-captured


Generate batch

POST /api/demo/generate-batch


34. DEMO PAYMENT FAILED ENDPOINT

Create:

POST /api/demo/payment-failed


Example:

{
  "customer": {
    "name": "Rahul",
    "email": "rahul@example.com",
    "phone": "919999999999",
    "lifetimeValue": 35000,
    "successfulPayments": 8,
    "failedPayments": 1
  },
  "payment": {
    "paymentId": "pay_demo_001",
    "orderId": "order_demo_001",
    "amount": 4999,
    "currency": "INR",
    "method": "card",
    "errorReason": "insufficient_funds"
  }
}


This endpoint must invoke the SAME recovery pipeline used by the real Razorpay webhook.

Do not duplicate business logic.

35. DEMO PAYMENT CAPTURED

Create:

POST /api/demo/payment-captured


Example:

{
  "paymentId": "pay_demo_001",
  "amount": 4999
}


This must invoke the same capture/recovery verification logic used by the Razorpay webhook.

36. BATCH SIMULATOR

Create:

POST /api/demo/generate-batch


Generate 100 synthetic cases.

Include:

first-time customers

repeat customers

high-LTV customers

low-LTV customers

insufficient funds

expired card

transient failure

authentication failure

repeated failure

high-risk cases

different payment amounts

Run each through the actual agent/policy pipeline.

Do not hardcode dashboard statistics.

37. BATCH RECOVERY OUTCOMES

The simulator should deterministically produce realistic outcomes so that the demo can calculate recovered revenue.

The simulator must model:

some payment-link cases recover
some retries recover
some cases fail again
some cases escalate
some cases stop


Persist these outcomes.

Dashboard metrics must be derived from database records.

38. BASELINE COMPARISON

Optional but preferred.

Implement:

baseline strategy:
always send generic reminder


Calculate:

baseline recovered revenue
agent recovered revenue
baseline recovery rate
agent recovery rate


Do not fabricate the comparison.

Run both against the same generated batch.

39. DASHBOARD

Build the frontend around revenue impact.

Top cards:

Revenue At Risk
Revenue Recovered
Recovery Rate
Cases Evaluated
Interventions
Recoveries
Escalations


All values must come from APIs/database.

40. DASHBOARD CASE TABLE

Columns:

Customer
Amount
Failure
Recovery Score
Diagnosis
Recommended Action
Approved Action
Channel
Status
Recovered Amount


Click a row to open case details.

41. DASHBOARD CASE DETAIL

Display:

Customer details
Payment details
Order details

Customer history

Diagnosis
Confidence
Recoverability probability

Recovery Opportunity Score
Expected Recovery Value

LLM reason

Policy decision
Policy reason

Actions
Notifications

Timeline

Current status
Recovered amount
Stop/escalation reason


42. AGENT ACTIVITY FEED

Example:

02:31:03
Payment failed — ₹4,999

Diagnosis:
SOFT_DECLINE

Recovery Score:
87

Expected Recovery Value:
₹3,480

Decision:
SEND_PAYMENT_LINK

Channel:
WHATSAPP

Status:
WAITING_FOR_OUTCOME


Later:

02:48:10
payment.captured

₹4,999 RECOVERED

Scheduled recovery actions cancelled.


43. CASE TIMELINE

Every RecoveryCase must expose a chronological event timeline.

Example:

01:31:03 payment.failed
01:31:03 case created
01:31:04 context loaded
01:31:04 AI diagnosis
01:31:04 recovery score calculated
01:31:04 policy approved action
01:31:05 payment link created
01:31:06 WhatsApp sent
02:04:11 payment.captured
02:04:11 recovery completed
02:04:11 scheduled actions cancelled


44. METRICS

Calculate:

Revenue At Risk
Revenue Recovered
Recovery Rate
Cases Evaluated
Interventions
Successful Recoveries
Escalations
Average Time To Recovery


Definitions:

Revenue At Risk =
sum of amounts from qualifying failed/open recovery cases

Revenue Recovered =
sum of recoveredAmount from RECOVERED cases

Recovery Rate =
Revenue Recovered / Revenue At Risk


Do not count the same payment twice.

45. LLM FAILURE FALLBACK

If the OpenAI API is unavailable or returns invalid JSON:

classify common failure types deterministically

assign conservative confidence

run through policy engine

do not execute risky actions automatically

create an audit log saying the AI was unavailable

Example:

LLM unavailable
→ UNKNOWN
→ confidence 0
→ ESCALATE or STOP


The backend must remain operational.

46. WHATSAPP FAILURE FALLBACK

If WhatsApp API fails:

WhatsApp failed
       ↓
persist failed action
       ↓
if email allowed
       ↓
send email


Do not repeatedly spam the customer.

47. EMAIL FAILURE

If SMTP fails:

persist failed RecoveryAction

write AuditLog

do not retry indefinitely

leave case waiting/escalated according to policy

48. SECURITY

Never log:

RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
OPENAI_API_KEY
WHATSAPP_ACCESS_TOKEN
SMTP_PASSWORD


Mask sensitive customer fields in logs.

All secrets must stay server-side.

49. TESTS

Create automated tests for:

Test 1

payment.failed
→ soft decline
→ payment link
→ WhatsApp
→ capture
→ recovered


Test 2

expired card
→ payment-method update
→ no automatic retry


Test 3

transient failure
→ retry scheduled


Test 4

high risk
→ escalation


Test 5

duplicate webhook
→ no duplicate case/action/message


Test 6

payment.failed
→ payment.captured
→ pending recovery actions cancelled


Test 7

WhatsApp failure
→ email fallback


Test 8

LLM failure
→ deterministic fallback


Test 9

retry limit reached
→ STOP


Test 10

outreach limit reached
→ STOP


50. DEMO SCENARIOS

The UI must support these four demos.

Demo A — Recoverable payment

₹4,999
insufficient funds
repeat customer

Agent:
SOFT_DECLINE
score 87
action SEND_PAYMENT_LINK
channel WHATSAPP


Then:

payment.captured


Result:

₹4,999 RECOVERED


Demo B — Smart non-retry

₹15,000
expired card
high-value repeat customer


Result:

PAYMENT_METHOD_ISSUE
REQUEST_PAYMENT_METHOD_UPDATE


No blind retry.

Demo C — Automatically stop after capture

payment.failed
→ recovery planned

payment.captured
→ STOP
→ cancel pending actions


Show no second message is sent.

Demo D — Escalate

₹80,000
repeated/high-risk failure


Result:

AUTO ACTION DENIED
→ HUMAN ESCALATION


51. FRONTEND PAGES

Implement:

/
  dashboard

/recovery
  recovery case table

/recovery/[id]
  case details

/escalations
  human review queue

/settings
  merchant configuration / policy thresholds


Keep UI simple and polished.

Do not spend excessive time on animations.

52. POLICY SETTINGS UI

Expose:

Maximum retries
Maximum outreach attempts
Cooldown hours
Minimum recovery value
High-value threshold
Low-confidence threshold


Saving settings should update backend configuration/database.

This allows the judge to see that the agent is bounded by merchant policy.

53. README

README must include:

What problem this solves.

What the agent does.

Architecture diagram.

Webhook flow.

LLM/policy separation.

Recovery actions.

Stopping rules.

WhatsApp integration.

SMTP configuration.

Razorpay configuration.

Local setup.

Database setup.

Running backend.

Running frontend.

Running demo scenarios.

Running tests.

Limitations.

Test-mode disclaimer.

54. LOCAL RUN COMMANDS

The project should support something close to:

docker compose up -d postgres

cd backend
npm install
npx prisma migrate dev
npm run dev

cd frontend
npm install
npm run dev


Add appropriate scripts to both package.json files.

55. IMPLEMENTATION ORDER

Build in this exact order.

STEP 1

Initialize Node.js + TypeScript + Fastify.

STEP 2

Configure Prisma + PostgreSQL.

STEP 3

Create all database models/migrations.

STEP 4

Implement Razorpay webhook raw-body capture.

STEP 5

Implement Razorpay signature verification.

STEP 6

Implement webhook idempotency.

STEP 7

Implement payment.failed processing.

STEP 8

Implement payment.captured/order.paid processing.

STEP 9

Implement customer context service.

STEP 10

Implement LLM diagnosis.

STEP 11

Implement recovery score.

STEP 12

Implement expected recovery value.

STEP 13

Implement deterministic policy engine.

STEP 14

Implement Razorpay payment-link creation.

STEP 15

Integrate existing WhatsApp sender.

STEP 16

Implement SMTP email.

STEP 17

Implement notification fallback.

STEP 18

Implement stopping rules.

STEP 19

Implement escalation.

STEP 20

Implement audit trail.

STEP 21

Implement metrics API.

STEP 22

Implement demo endpoints.

STEP 23

Implement batch simulator.

STEP 24

Implement frontend dashboard.

STEP 25

Implement tests.

STEP 26

Polish README and demo flow.

56. DEFINITION OF DONE

Do not declare the project finished until all of these work:

[ ] TypeScript backend runs
[ ] PostgreSQL runs
[ ] Prisma migrations work
[ ] Razorpay webhook endpoint works
[ ] Razorpay signature verification works
[ ] Duplicate event protection works
[ ] payment.failed creates recovery case
[ ] Customer context is loaded
[ ] LLM diagnosis works
[ ] Structured LLM output validated by Zod
[ ] Recovery score calculated
[ ] Expected recovery value calculated
[ ] Policy engine works
[ ] Stopping rules work
[ ] Razorpay payment link works in test mode
[ ] WhatsApp notification works through provided sender
[ ] SMTP email works
[ ] WhatsApp failure falls back to email
[ ] payment.captured marks recovery successful
[ ] order.paid marks recovery successful
[ ] Pending actions cancelled after recovery
[ ] Human escalation works
[ ] Audit logs are persisted
[ ] Dashboard metrics are dynamic
[ ] Batch simulator works
[ ] Demo cases work end-to-end
[ ] Tests pass
[ ] README contains exact setup instructions


57. IMPORTANT DEVELOPMENT RULES

Do NOT:

train an ML model

create fake AI scores with no explanation

let the LLM directly execute payments

hardcode fake dashboard numbers

use a third-party email provider

replace the provided WhatsApp integration

create a separate fake demo pipeline

create unnecessary microservices

implement abandoned checkout before failed-payment recovery works

build a complicated multi-agent system

optimize for feature count over reliability

Do:

keep payment state authoritative

use deterministic policy controls

make all actions auditable

make all external actions idempotent

make every recovery measurable in INR

make recovery success observable from Razorpay events

keep the implementation simple enough to finish in 2 days

58. FINAL PRODUCT BEHAVIOR

A merchant should be able to see this:

REVENUE AT RISK
₹184,500


The system receives:

payment.failed


The agent evaluates:

Customer Value
Payment Amount
Failure Reason
History
Prior Recovery Attempts


Then:

Diagnosis:
SOFT_DECLINE

Recovery Opportunity:
87 / 100

Recoverability:
78%

Expected Recovery Value:
₹3,480

Decision:
SEND_PAYMENT_LINK

Channel:
WHATSAPP


The system sends the message.

Then Razorpay reports:

payment.captured


The agent:

marks case RECOVERED
records ₹4,999 recovered
cancels pending actions
updates dashboard


The final dashboard displays actual calculated metrics.

59. CORE DESIGN PRINCIPLE

The architecture MUST enforce:

LLM
  ↓
RECOMMENDATION

POLICY ENGINE
  ↓
ALLOW / DENY / ESCALATE / STOP

ACTION EXECUTOR
  ↓
BOUNDED SIDE EFFECT

RAZORPAY EVENT
  ↓
VERIFY OUTCOME


Never:

LLM
  ↓
arbitrary financial action


The system should behave like a cautious autonomous revenue-recovery operator, not like an unrestricted chatbot.

60. START BUILDING

Start by creating the repository structure, package configuration, Prisma schema, Fastify server, .env.example, and database migration.

Then implement the working vertical slice:

payment.failed
→ webhook verification
→ idempotency
→ RecoveryCase
→ LLM diagnosis
→ policy
→ payment link
→ WhatsApp
→ payment.captured
→ RECOVERED


Do not start with frontend polish.

Do not leave TODO placeholders in the core flow.

When a component is not yet implemented, implement the smallest working version immediately and continue until the complete vertical slice is functional.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/47bc81ca-56ca-4114-a7f2-7d5e8ec45040).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
