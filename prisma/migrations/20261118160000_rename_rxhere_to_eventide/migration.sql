-- Preserve order history: rename legacy RxHere columns to Eventide.
ALTER TABLE "Order" RENAME COLUMN "rxhereOrderId" TO "eventideOrderId";
ALTER TABLE "Order" RENAME COLUMN "rxhereBatchId" TO "eventideBatchId";

DROP INDEX IF EXISTS "Order_rxhereOrderId_idx";
CREATE INDEX IF NOT EXISTS "Order_eventideOrderId_idx" ON "Order"("eventideOrderId");
