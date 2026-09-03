-- CreateEnum
CREATE TYPE "CommunicationPreference" AS ENUM ('WHATSAPP', 'EMAIL', 'BOTH', 'NONE');

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('NEW', 'ANALYZING', 'ACTION_PLANNED', 'ACTION_EXECUTED', 'WAITING_FOR_OUTCOME', 'RETRY_PENDING', 'RECOVERED', 'ESCALATED', 'STOPPED');

-- CreateEnum
CREATE TYPE "RecoveryActionType" AS ENUM ('SEND_PAYMENT_LINK', 'REQUEST_PAYMENT_METHOD_UPDATE', 'SCHEDULE_RETRY', 'SEND_REMINDER', 'ESCALATE', 'WAIT', 'STOP');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'EXECUTING', 'SENT', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "externalCustomerId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "lifetimeValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "successfulPayments" INTEGER NOT NULL DEFAULT 0,
    "failedPayments" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessfulPaymentAt" TIMESTAMP(3),
    "communicationPreference" "CommunicationPreference" NOT NULL DEFAULT 'BOTH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "customerId" UUID,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'created',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "razorpayPaymentId" TEXT NOT NULL,
    "razorpayOrderId" TEXT,
    "customerId" UUID,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "method" TEXT,
    "status" TEXT NOT NULL DEFAULT 'failed',
    "errorCode" TEXT,
    "errorDescription" TEXT,
    "errorReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "razorpayEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "status" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCase" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "orderId" UUID,
    "customerId" UUID,
    "status" "CaseStatus" NOT NULL DEFAULT 'NEW',
    "diagnosis" TEXT,
    "diagnosisConfidence" DECIMAL(65,30),
    "recoverabilityProbability" DECIMAL(65,30),
    "recoveryScore" DECIMAL(65,30),
    "expectedRecoveryValue" DECIMAL(65,30),
    "recommendedAction" "RecoveryActionType",
    "approvedAction" "RecoveryActionType",
    "channel" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "outreachCount" INTEGER NOT NULL DEFAULT 0,
    "nextActionAt" TIMESTAMP(3),
    "recoveredAmount" DECIMAL(65,30),
    "paymentLinkUrl" TEXT,
    "llmReason" TEXT,
    "policyDecision" TEXT,
    "policyReason" TEXT,
    "escalationReason" TEXT,
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryAction" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "action" "RecoveryActionType" NOT NULL,
    "channel" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "caseId" UUID,
    "eventType" TEXT NOT NULL,
    "decision" TEXT,
    "reason" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "customerSnapshot" JSONB NOT NULL,
    "failure" TEXT,
    "diagnosis" TEXT,
    "confidence" DECIMAL(65,30),
    "previousActions" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "recommendedNextStep" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicySettings" (
    "id" UUID NOT NULL,
    "maxRetryAttempts" INTEGER NOT NULL DEFAULT 2,
    "maxOutreachAttempts" INTEGER NOT NULL DEFAULT 2,
    "cooldownHours" INTEGER NOT NULL DEFAULT 24,
    "minimumRecoveryValue" DECIMAL(65,30) NOT NULL DEFAULT 100,
    "highValueThreshold" DECIMAL(65,30) NOT NULL DEFAULT 25000,
    "lowConfidenceThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0.60,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_externalCustomerId_key" ON "Customer"("externalCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_razorpayOrderId_key" ON "Order"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpayPaymentId_key" ON "Payment"("razorpayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_razorpayEventId_key" ON "WebhookEvent"("razorpayEventId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryAction_caseId_action_key" ON "RecoveryAction"("caseId", "action");

-- CreateIndex
CREATE INDEX "AuditLog_caseId_createdAt_idx" ON "AuditLog"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Escalation_caseId_key" ON "Escalation"("caseId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_razorpayOrderId_fkey" FOREIGN KEY ("razorpayOrderId") REFERENCES "Order"("razorpayOrderId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryAction" ADD CONSTRAINT "RecoveryAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
