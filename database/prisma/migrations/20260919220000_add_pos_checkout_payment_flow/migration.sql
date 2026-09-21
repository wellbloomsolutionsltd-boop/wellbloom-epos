-- CreateEnum
CREATE TYPE "PosCheckoutStatus" AS ENUM ('AWAITING_PAYMENT', 'PAYMENT_PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "PaymentTargetType" ADD VALUE 'POS_CHECKOUT';

-- AlterTable
ALTER TABLE "InventoryReservation" ADD COLUMN "posCheckoutId" TEXT,
ALTER COLUMN "orderId" DROP NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN "posCheckoutId" TEXT;

-- CreateTable
CREATE TABLE "PosCheckout" (
    "id" TEXT NOT NULL,
    "checkoutNumber" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "PosCheckoutStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "reservedAt" TIMESTAMP(3),
    "reservationExpiresAt" TIMESTAMP(3),
    "paymentStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosCheckoutItem" (
    "id" TEXT NOT NULL,
    "posCheckoutId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PosCheckoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosCheckout_checkoutNumber_key" ON "PosCheckout"("checkoutNumber");
CREATE UNIQUE INDEX "PosCheckout_saleId_key" ON "PosCheckout"("saleId");
CREATE INDEX "PosCheckout_tenantId_idx" ON "PosCheckout"("tenantId");
CREATE INDEX "PosCheckout_branchId_idx" ON "PosCheckout"("branchId");
CREATE INDEX "PosCheckout_cashierId_idx" ON "PosCheckout"("cashierId");
CREATE INDEX "PosCheckout_shiftId_idx" ON "PosCheckout"("shiftId");
CREATE INDEX "PosCheckout_customerId_idx" ON "PosCheckout"("customerId");
CREATE INDEX "PosCheckout_status_idx" ON "PosCheckout"("status");
CREATE INDEX "PosCheckout_createdAt_idx" ON "PosCheckout"("createdAt");
CREATE INDEX "PosCheckoutItem_posCheckoutId_idx" ON "PosCheckoutItem"("posCheckoutId");
CREATE INDEX "PosCheckoutItem_productId_idx" ON "PosCheckoutItem"("productId");
CREATE UNIQUE INDEX "InventoryReservation_posCheckoutId_productId_key" ON "InventoryReservation"("posCheckoutId", "productId");
CREATE INDEX "Order_idempotencyKey_idx" ON "Order"("idempotencyKey");
CREATE INDEX "PaymentTransaction_posCheckoutId_idx" ON "PaymentTransaction"("posCheckoutId");

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_posCheckoutId_fkey" FOREIGN KEY ("posCheckoutId") REFERENCES "PosCheckout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosCheckout" ADD CONSTRAINT "PosCheckout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosCheckout" ADD CONSTRAINT "PosCheckout_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosCheckout" ADD CONSTRAINT "PosCheckout_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosCheckout" ADD CONSTRAINT "PosCheckout_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosCheckout" ADD CONSTRAINT "PosCheckout_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosCheckout" ADD CONSTRAINT "PosCheckout_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosCheckoutItem" ADD CONSTRAINT "PosCheckoutItem_posCheckoutId_fkey" FOREIGN KEY ("posCheckoutId") REFERENCES "PosCheckout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosCheckoutItem" ADD CONSTRAINT "PosCheckoutItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_posCheckoutId_fkey" FOREIGN KEY ("posCheckoutId") REFERENCES "PosCheckout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
