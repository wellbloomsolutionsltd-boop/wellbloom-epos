ALTER TABLE "InventoryMovement"
ADD COLUMN "quantityBefore" DECIMAL(12,3),
ADD COLUMN "quantityAfter" DECIMAL(12,3);

UPDATE "InventoryMovement" AS movement
SET
  "quantityBefore" = inventory."quantity" - movement."quantity",
  "quantityAfter" = inventory."quantity"
FROM "Inventory" AS inventory
WHERE inventory."branchId" = movement."branchId"
  AND inventory."productId" = movement."productId";

ALTER TABLE "InventoryMovement"
ALTER COLUMN "quantityBefore" SET NOT NULL,
ALTER COLUMN "quantityAfter" SET NOT NULL;

CREATE INDEX "InventoryMovement_referenceId_idx"
ON "InventoryMovement"("referenceId");