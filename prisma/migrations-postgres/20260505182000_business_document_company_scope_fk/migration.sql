CREATE UNIQUE INDEX IF NOT EXISTS "BusinessDocument_companyId_id_key"
ON "BusinessDocument" ("companyId", "id");

ALTER TABLE "Transaction"
DROP CONSTRAINT IF EXISTS "Transaction_businessDocument_fkey";

ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_company_businessDocument_fkey"
FOREIGN KEY ("companyId", "businessDocumentId")
REFERENCES "BusinessDocument"("companyId", "id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "StockBatch"
DROP CONSTRAINT IF EXISTS "StockBatch_businessDocument_fkey";

ALTER TABLE "StockBatch"
ADD CONSTRAINT "StockBatch_company_businessDocument_fkey"
FOREIGN KEY ("companyId", "businessDocumentId")
REFERENCES "BusinessDocument"("companyId", "id")
ON DELETE SET NULL
ON UPDATE CASCADE;
