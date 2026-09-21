ALTER TABLE "InventoryReservation"
ADD COLUMN "expiredAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "InventoryReservation_orderId_productId_key"
ON "InventoryReservation"("orderId", "productId");