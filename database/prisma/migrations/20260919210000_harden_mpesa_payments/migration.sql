ALTER TYPE "PaymentTransactionStatus"
ADD VALUE IF NOT EXISTS 'VERIFYING';

ALTER TYPE "PaymentTransactionStatus"
ADD VALUE IF NOT EXISTS 'REQUIRES_REVIEW';

ALTER TABLE "PaymentTransaction"
ADD COLUMN "providerAmount" DECIMAL(12,2),
ADD COLUMN "providerPhone" TEXT,
ADD COLUMN "providerTransactionDate" TIMESTAMP(3),
ADD COLUMN "callbackReceivedAt" TIMESTAMP(3),
ADD COLUMN "verificationStartedAt" TIMESTAMP(3),
ADD COLUMN "rawVerification" JSONB;

CREATE UNIQUE INDEX "PaymentTransaction_providerCheckoutId_key"
ON "PaymentTransaction"("providerCheckoutId");
