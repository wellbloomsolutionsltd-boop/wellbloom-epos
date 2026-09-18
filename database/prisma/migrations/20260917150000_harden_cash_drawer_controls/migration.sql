-- CreateEnum
CREATE TYPE "CashMovementApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CashAdjustmentType" AS ENUM ('CASH_IN', 'CASH_OUT', 'BANK_DROP');

-- CreateTable
CREATE TABLE "CashMovementRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "type" "CashAdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "status" "CashMovementApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "movementId" TEXT,

    CONSTRAINT "CashMovementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashMovementRequest_tenantId_idx" ON "CashMovementRequest"("tenantId");

-- CreateIndex
CREATE INDEX "CashMovementRequest_branchId_idx" ON "CashMovementRequest"("branchId");

-- CreateIndex
CREATE INDEX "CashMovementRequest_shiftId_idx" ON "CashMovementRequest"("shiftId");

-- CreateIndex
CREATE INDEX "CashMovementRequest_requestedById_idx" ON "CashMovementRequest"("requestedById");

-- CreateIndex
CREATE INDEX "CashMovementRequest_approvedById_idx" ON "CashMovementRequest"("approvedById");

-- CreateIndex
CREATE INDEX "CashMovementRequest_status_idx" ON "CashMovementRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovementRequest_movementId_key" ON "CashMovementRequest"("movementId");

-- AddForeignKey
ALTER TABLE "CashMovementRequest" ADD CONSTRAINT "CashMovementRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovementRequest" ADD CONSTRAINT "CashMovementRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovementRequest" ADD CONSTRAINT "CashMovementRequest_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovementRequest" ADD CONSTRAINT "CashMovementRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovementRequest" ADD CONSTRAINT "CashMovementRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovementRequest" ADD CONSTRAINT "CashMovementRequest_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "CashDrawerMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
