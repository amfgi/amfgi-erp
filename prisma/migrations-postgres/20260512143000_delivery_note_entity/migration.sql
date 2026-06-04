-- Delivery note as first-class document; link STOCK_OUT lines via deliveryNoteId.
-- Idempotent: safe when DeliveryNote or columns were created manually or by partial apply.

CREATE TABLE IF NOT EXISTS "DeliveryNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "jobId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "materialDispatchSkipped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "customItemsJson" JSONB;
ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "documentNotes" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryNote_companyId_number_key" ON "DeliveryNote"("companyId", "number");
CREATE INDEX IF NOT EXISTS "DeliveryNote_companyId_jobId_idx" ON "DeliveryNote"("companyId", "jobId");
CREATE INDEX IF NOT EXISTS "DeliveryNote_companyId_date_idx" ON "DeliveryNote"("companyId", "date");

DO $dn_fk$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryNote_companyId_fkey') THEN
    ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryNote_companyId_jobId_fkey') THEN
    ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_companyId_jobId_fkey" FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $dn_fk$;

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "deliveryNoteId" TEXT;

-- One DeliveryNote per (company, parsed legacy number); pick earliest txn as canonical job/date.
WITH parsed AS (
  SELECT
    t."id",
    t."companyId",
    t."jobId",
    t."date",
    t."createdAt",
    t."updatedAt",
    (regexp_match(t."notes", '--- DELIVERY NOTE #(\d+)'))[1]::integer AS num
  FROM "Transaction" t
  WHERE t."isDeliveryNote" = true
    AND t."notes" IS NOT NULL
    AND t."notes" LIKE '%--- DELIVERY NOTE #%'
    AND (regexp_match(t."notes", '--- DELIVERY NOTE #(\d+)'))[1] IS NOT NULL
),
picked AS (
  SELECT DISTINCT ON (p."companyId", p.num)
    gen_random_uuid()::text AS new_id,
    p."companyId",
    p.num,
    p."jobId",
    p."date",
    p."createdAt",
    p."updatedAt"
  FROM parsed p
  ORDER BY p."companyId", p.num, p."createdAt" ASC
)
INSERT INTO "DeliveryNote" ("id", "companyId", "number", "jobId", "date", "createdAt", "updatedAt")
SELECT p.new_id, p."companyId", p.num, p."jobId", p."date", p."createdAt", p."updatedAt"
FROM picked p
WHERE NOT EXISTS (
  SELECT 1 FROM "DeliveryNote" dn
  WHERE dn."companyId" = p."companyId" AND dn."number" = p.num
);

UPDATE "Transaction" AS tr
SET "deliveryNoteId" = dn."id"
FROM "DeliveryNote" AS dn
WHERE tr."companyId" = dn."companyId"
  AND tr."isDeliveryNote" = true
  AND tr."notes" IS NOT NULL
  AND tr."notes" LIKE '%--- DELIVERY NOTE #%'
  AND dn."number" = (regexp_match(tr."notes", '--- DELIVERY NOTE #(\d+)'))[1]::integer
  AND tr."deliveryNoteId" IS NULL;

DO $txn_fk$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_deliveryNoteId_fkey') THEN
    ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $txn_fk$;

CREATE INDEX IF NOT EXISTS "Transaction_deliveryNoteId_idx" ON "Transaction"("deliveryNoteId");

DROP INDEX IF EXISTS "Transaction_companyId_postingGroupId_idx";
DROP INDEX IF EXISTS "Transaction_company_posting_group_idx";
ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "postingGroupId";
