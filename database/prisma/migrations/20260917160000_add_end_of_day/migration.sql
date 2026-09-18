-- CreateEnum
CREATE TYPE "EndOfDayStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "EndOfDay" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "closedById" TEXT,
    "status" "EndOfDayStatus" NOT NULL DEFAULT 'OPEN',
    "totalSales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalReturns" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mpesaTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cardTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bankTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insuranceTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "shiftCount" INTEGER NOT NULL DEFAULT 0,
    "totalCashVariance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EndOfDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EndOfDay_tenantId_branchId_businessDate_key" ON "EndOfDay"("tenantId", "branchId", "businessDate");

-- CreateIndex
CREATE INDEX "EndOfDay_tenantId_idx" ON "EndOfDay"("tenantId");

-- CreateIndex
CREATE INDEX "EndOfDay_branchId_idx" ON "EndOfDay"("branchId");

-- CreateIndex
CREATE INDEX "EndOfDay_businessDate_idx" ON "EndOfDay"("businessDate");

-- CreateIndex
CREATE INDEX "EndOfDay_status_idx" ON "EndOfDay"("status");

-- AddForeignKey
ALTER TABLE "EndOfDay" ADD CONSTRAINT "EndOfDay_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndOfDay" ADD CONSTRAINT "EndOfDay_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndOfDay" ADD CONSTRAINT "EndOfDay_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
