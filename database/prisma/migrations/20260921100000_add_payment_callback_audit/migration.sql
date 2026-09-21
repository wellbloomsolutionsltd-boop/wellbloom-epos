-- CreateTable
CREATE TABLE "PaymentCallbackEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerCheckoutId" TEXT,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processingResult" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentCallbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentCallbackEvent_provider_idx" ON "PaymentCallbackEvent"("provider");
CREATE INDEX "PaymentCallbackEvent_providerCheckoutId_idx" ON "PaymentCallbackEvent"("providerCheckoutId");
CREATE INDEX "PaymentCallbackEvent_receivedAt_idx" ON "PaymentCallbackEvent"("receivedAt");
