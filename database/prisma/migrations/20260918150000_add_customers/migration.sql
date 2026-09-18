-- Upgrade the original customer record without losing legacy names.
ALTER TABLE "Customer"
ADD COLUMN "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "dateOfBirth" TIMESTAMP(3),
ADD COLUMN "firstName" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "notes" TEXT;

UPDATE "Customer"
SET "firstName" = "name";

ALTER TABLE "Customer"
ALTER COLUMN "firstName" SET NOT NULL,
DROP COLUMN "name";

CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");
CREATE INDEX "Customer_firstName_idx" ON "Customer"("firstName");
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");
CREATE UNIQUE INDEX "Customer_tenantId_email_key" ON "Customer"("tenantId", "email");
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");
