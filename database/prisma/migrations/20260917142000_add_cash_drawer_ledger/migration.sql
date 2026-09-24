-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('OPENING_FLOAT', 'CASH_SALE', 'CASH_REFUND', 'CASH_IN', 'CASH_OUT', 'BANK_DROP', 'CLOSING_COUNT');

-- CreateTable
CREATE TABLE "CashDrawerMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT,

    CONSTRAINT "CashDrawerMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashDrawerMovement_tenantId_idx" ON "CashDrawerMovement"("tenantId");

-- CreateIndex
CREATE INDEX "CashDrawerMovement_branchId_idx" ON "CashDrawerMovement"("branchId");

-- CreateIndex
CREATE INDEX "CashDrawerMovement_shiftId_idx" ON "CashDrawerMovement"("shiftId");

-- CreateIndex
CREATE INDEX "CashDrawerMovement_userId_idx" ON "CashDrawerMovement"("userId");

-- CreateIndex
CREATE INDEX "CashDrawerMovement_type_idx" ON "CashDrawerMovement"("type");

-- CreateIndex
CREATE INDEX "CashDrawerMovement_createdAt_idx" ON "CashDrawerMovement"("createdAt");

-- AddForeignKey
ALTER TABLE "CashDrawerMovement" ADD CONSTRAINT "CashDrawerMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawerMovement" ADD CONSTRAINT "CashDrawerMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawerMovement" ADD CONSTRAINT "CashDrawerMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawerMovement" ADD CONSTRAINT "CashDrawerMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawerMovement" ADD CONSTRAINT "CashDrawerMovement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
