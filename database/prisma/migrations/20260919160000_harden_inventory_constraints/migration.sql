ALTER TABLE "Inventory"
ADD CONSTRAINT "Inventory_quantity_nonnegative"
CHECK ("quantity" >= 0);

ALTER TABLE "Inventory"
ADD CONSTRAINT "Inventory_reserved_nonnegative"
CHECK ("reservedQty" >= 0);

ALTER TABLE "Inventory"
ADD CONSTRAINT "Inventory_reserved_not_above_quantity"
CHECK ("reservedQty" <= "quantity");