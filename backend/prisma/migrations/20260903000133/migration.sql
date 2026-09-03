-- AlterTable
ALTER TABLE "RecoveryCase" ADD COLUMN     "amountDue" DECIMAL(65,30),
ADD COLUMN     "razorpayPaymentLinkId" TEXT;
