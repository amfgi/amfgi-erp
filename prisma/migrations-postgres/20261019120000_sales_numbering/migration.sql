-- Separate document numbers, rejected queries, line fields, revision snapshots,
-- and rename the operations stage to purchase orders.

ALTER TYPE "SalesStage" RENAME VALUE 'OPERATIONS' TO 'PURCHASE_ORDER';
ALTER TYPE "SalesClosure" ADD VALUE 'REJECTED';

ALTER TABLE "SalesQuery" ADD COLUMN "quotationNumber" VARCHAR(100);
ALTER TABLE "SalesQuery" ADD COLUMN "quotationNumberKey" VARCHAR(100);
ALTER TABLE "SalesQuery" RENAME COLUMN "operationsNotes" TO "purchaseOrderNotes";

UPDATE "SalesQuery"
SET
  "quotationNumber" = "queryNumber",
  "quotationNumberKey" = lower(btrim("queryNumber"))
WHERE "stage" <> 'QUERY'
  AND "quotationNumber" IS NULL;

CREATE UNIQUE INDEX "SalesQuery_companyId_quotationNumberKey_key"
  ON "SalesQuery"("companyId", "quotationNumberKey");

CREATE TABLE "SalesQuotationLineField" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "value" VARCHAR(500) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesQuotationLineField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesQuotationRevision" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesQueryId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "quotationLabel" VARCHAR(120) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesQuotationRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesQuotationLineField_companyId_lineId_sortOrder_idx"
  ON "SalesQuotationLineField"("companyId", "lineId", "sortOrder");

CREATE UNIQUE INDEX "SalesQuotationRevision_salesQueryId_revision_key"
  ON "SalesQuotationRevision"("salesQueryId", "revision");

CREATE INDEX "SalesQuotationRevision_companyId_salesQueryId_idx"
  ON "SalesQuotationRevision"("companyId", "salesQueryId");

ALTER TABLE "SalesQuotationLineField"
  ADD CONSTRAINT "SalesQuotationLineField_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesQuotationLineField"
  ADD CONSTRAINT "SalesQuotationLineField_lineId_fkey"
  FOREIGN KEY ("lineId") REFERENCES "SalesQuotationLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesQuotationRevision"
  ADD CONSTRAINT "SalesQuotationRevision_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesQuotationRevision"
  ADD CONSTRAINT "SalesQuotationRevision_companyId_salesQueryId_fkey"
  FOREIGN KEY ("companyId", "salesQueryId") REFERENCES "SalesQuery"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Role"
SET "permissions" = (
  SELECT jsonb_agg(DISTINCT
    CASE
      WHEN item = 'sales.operations.view' THEN 'sales.purchaseOrders.view'
      WHEN item = 'sales.operations.manage' THEN 'sales.purchaseOrders.manage'
      ELSE item
    END
  )::json
  FROM jsonb_array_elements_text("permissions"::jsonb) AS item
)
WHERE jsonb_typeof("permissions"::jsonb) = 'array'
  AND "permissions"::text LIKE '%sales.operations.%';
