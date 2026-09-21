-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_provider_externalReference_key"
ON "PaymentTransaction"("provider", "externalReference");
