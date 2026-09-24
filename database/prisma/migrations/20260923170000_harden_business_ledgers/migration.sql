-- Preserve reservation history when an order or checkout is removed.
ALTER TABLE "InventoryReservation"
DROP CONSTRAINT "InventoryReservation_orderId_fkey";

ALTER TABLE "InventoryReservation"
ADD CONSTRAINT "InventoryReservation_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryReservation"
DROP CONSTRAINT "InventoryReservation_posCheckoutId_fkey";

ALTER TABLE "InventoryReservation"
ADD CONSTRAINT "InventoryReservation_posCheckoutId_fkey"
FOREIGN KEY ("posCheckoutId") REFERENCES "PosCheckout"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- True ledgers and closed End-of-Day snapshots are insert-only.
CREATE OR REPLACE FUNCTION wellbloom_reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed',
    TG_TABLE_NAME,
    TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION wellbloom_reject_append_only_mutation();

CREATE TRIGGER inventory_movement_append_only
BEFORE UPDATE OR DELETE ON "InventoryMovement"
FOR EACH ROW
EXECUTE FUNCTION wellbloom_reject_append_only_mutation();

CREATE TRIGGER cash_drawer_movement_append_only
BEFORE UPDATE OR DELETE ON "CashDrawerMovement"
FOR EACH ROW
EXECUTE FUNCTION wellbloom_reject_append_only_mutation();

CREATE TRIGGER end_of_day_append_only
BEFORE UPDATE OR DELETE ON "EndOfDay"
FOR EACH ROW
EXECUTE FUNCTION wellbloom_reject_append_only_mutation();

-- Sales keep their financial facts immutable and only move forward.
CREATE OR REPLACE FUNCTION wellbloom_protect_sale_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Sale history cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status"::text IN ('VOIDED', 'REFUNDED') THEN
    RAISE EXCEPTION 'Terminal Sale records are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."saleNumber" IS DISTINCT FROM OLD."saleNumber"
    OR NEW."receiptNumber" IS DISTINCT FROM OLD."receiptNumber"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
    OR NEW."cashierId" IS DISTINCT FROM OLD."cashierId"
    OR NEW."customerId" IS DISTINCT FROM OLD."customerId"
    OR NEW."shiftId" IS DISTINCT FROM OLD."shiftId"
    OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
    OR NEW."discountAmount" IS DISTINCT FROM OLD."discountAmount"
    OR NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount"
    OR NEW."totalAmount" IS DISTINCT FROM OLD."totalAmount"
    OR NEW."amountPaid" IS DISTINCT FROM OLD."amountPaid"
    OR NEW."changeAmount" IS DISTINCT FROM OLD."changeAmount"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Sale financial and identity fields are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NOT (
    (OLD."status"::text = 'PENDING' AND NEW."status"::text = 'COMPLETED')
    OR
    (OLD."status"::text = 'COMPLETED' AND NEW."status"::text IN ('VOIDED', 'REFUNDED'))
  ) THEN
    RAISE EXCEPTION 'Invalid Sale status transition: % -> %',
      OLD."status",
      NEW."status"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."status"::text = 'VOIDED' AND (
    NEW."voidedAt" IS NULL
    OR NEW."voidedById" IS NULL
    OR NULLIF(BTRIM(NEW."voidReason"), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Voided Sale requires actor, timestamp, and reason'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sale_lifecycle_guard
BEFORE UPDATE OR DELETE ON "Sale"
FOR EACH ROW
EXECUTE FUNCTION wellbloom_protect_sale_lifecycle();

-- A shift can close once; a closed shift cannot be rewritten or deleted.
CREATE OR REPLACE FUNCTION wellbloom_protect_shift_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Shift history cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status"::text = 'CLOSED' THEN
    RAISE EXCEPTION 'Closed Shift records are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."shiftNumber" IS DISTINCT FROM OLD."shiftNumber"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."openingCash" IS DISTINCT FROM OLD."openingCash"
    OR NEW."openedAt" IS DISTINCT FROM OLD."openedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Shift identity and opening fields are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NOT (
    OLD."status"::text = 'OPEN'
    AND NEW."status"::text = 'CLOSED'
  ) THEN
    RAISE EXCEPTION 'Invalid Shift status transition: % -> %',
      OLD."status",
      NEW."status"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."closedAt" IS NULL
    OR NEW."expectedCash" IS NULL
    OR NEW."countedCash" IS NULL
    OR NEW."cashDifference" IS NULL
  THEN
    RAISE EXCEPTION 'Closed Shift requires complete closure totals'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER shift_lifecycle_guard
BEFORE UPDATE OR DELETE ON "Shift"
FOR EACH ROW
EXECUTE FUNCTION wellbloom_protect_shift_lifecycle();

-- Reservations retain identity and may transition out of ACTIVE exactly once.
CREATE OR REPLACE FUNCTION wellbloom_protect_reservation_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'InventoryReservation history cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status"::text <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Terminal InventoryReservation records are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
    OR NEW."productId" IS DISTINCT FROM OLD."productId"
    OR NEW."orderId" IS DISTINCT FROM OLD."orderId"
    OR NEW."posCheckoutId" IS DISTINCT FROM OLD."posCheckoutId"
    OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'InventoryReservation identity and quantity are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."status"::text NOT IN ('CONSUMED', 'RELEASED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Invalid InventoryReservation status transition: % -> %',
      OLD."status",
      NEW."status"
      USING ERRCODE = '55000';
  END IF;

  IF (NEW."status"::text = 'CONSUMED' AND NEW."consumedAt" IS NULL)
    OR (NEW."status"::text = 'RELEASED' AND NEW."releasedAt" IS NULL)
    OR (NEW."status"::text = 'EXPIRED' AND NEW."expiredAt" IS NULL)
  THEN
    RAISE EXCEPTION 'InventoryReservation terminal transition requires its timestamp'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_reservation_lifecycle_guard
BEFORE UPDATE OR DELETE ON "InventoryReservation"
FOR EACH ROW
EXECUTE FUNCTION wellbloom_protect_reservation_lifecycle();

-- Payments are mutable only while following the supported state machine.
CREATE OR REPLACE FUNCTION wellbloom_protect_payment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PaymentTransaction history cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."transactionNumber" IS DISTINCT FROM OLD."transactionNumber"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
    OR NEW."targetType" IS DISTINCT FROM OLD."targetType"
    OR NEW."orderId" IS DISTINCT FROM OLD."orderId"
    OR NEW."posCheckoutId" IS DISTINCT FROM OLD."posCheckoutId"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."amount" IS DISTINCT FROM OLD."amount"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."initiatedAt" IS DISTINCT FROM OLD."initiatedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'PaymentTransaction identity and amount are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status"::text IN ('FAILED', 'CANCELLED', 'REFUNDED') THEN
    RAISE EXCEPTION 'Terminal PaymentTransaction records are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status"::text = 'SUCCEEDED' THEN
    IF NEW."status"::text = 'REFUNDED' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Successful PaymentTransaction can only transition to REFUNDED'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status"::text = NEW."status"::text THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD."status"::text = 'INITIATED' AND NEW."status"::text IN ('PENDING', 'VERIFYING', 'FAILED', 'REQUIRES_REVIEW'))
    OR
    (OLD."status"::text = 'PENDING' AND NEW."status"::text IN ('VERIFYING', 'SUCCEEDED', 'FAILED', 'REQUIRES_REVIEW'))
    OR
    (OLD."status"::text = 'VERIFYING' AND NEW."status"::text IN ('SUCCEEDED', 'FAILED', 'REQUIRES_REVIEW'))
    OR
    (OLD."status"::text = 'REQUIRES_REVIEW' AND NEW."status"::text IN ('SUCCEEDED', 'FAILED'))
  ) THEN
    RAISE EXCEPTION 'Invalid PaymentTransaction status transition: % -> %',
      OLD."status",
      NEW."status"
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_transaction_lifecycle_guard
BEFORE UPDATE OR DELETE ON "PaymentTransaction"
FOR EACH ROW
EXECUTE FUNCTION wellbloom_protect_payment_lifecycle();

-- Callback evidence is immutable; only its first processing result may be set.
CREATE OR REPLACE FUNCTION wellbloom_protect_callback_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PaymentCallbackEvent history cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."processed" THEN
    RAISE EXCEPTION 'Processed PaymentCallbackEvent records are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."providerCheckoutId" IS DISTINCT FROM OLD."providerCheckoutId"
    OR NEW."payload" IS DISTINCT FROM OLD."payload"
    OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt"
  THEN
    RAISE EXCEPTION 'PaymentCallbackEvent callback evidence is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NOT NEW."processed" OR NEW."processedAt" IS NULL THEN
    RAISE EXCEPTION 'PaymentCallbackEvent may only be updated with a completed processing result'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_callback_event_guard
BEFORE UPDATE OR DELETE ON "PaymentCallbackEvent"
FOR EACH ROW
EXECUTE FUNCTION wellbloom_protect_callback_event();
