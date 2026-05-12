CREATE TYPE "BusinessDocumentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'VOID');

CREATE TABLE "BusinessDocument" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "docType" TEXT NOT NULL,
  "docNumber" TEXT NOT NULL,
  "docDate" TIMESTAMP(3) NOT NULL,
  "status" "BusinessDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceModule" TEXT NOT NULL,
  "partyType" TEXT,
  "partyId" TEXT,
  "currencyCode" TEXT,
  "fxRate" DECIMAL(18,6),
  "totals" JSONB,
  "meta" JSONB,
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessDocument_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BusinessDocument"
ADD CONSTRAINT "BusinessDocument_company_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessDocument"
ADD CONSTRAINT "BusinessDocument_createdBy_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BusinessDocument"
ADD CONSTRAINT "BusinessDocument_approvedBy_fkey"
FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "BusinessDocument_company_docType_docNumber_key"
ON "BusinessDocument" ("companyId", "docType", "docNumber");

CREATE INDEX "BusinessDocument_company_docType_status_docDate_idx"
ON "BusinessDocument" ("companyId", "docType", "status", "docDate");

CREATE INDEX "BusinessDocument_company_sourceModule_docDate_idx"
ON "BusinessDocument" ("companyId", "sourceModule", "docDate");

CREATE INDEX "BusinessDocument_company_partyType_partyId_idx"
ON "BusinessDocument" ("companyId", "partyType", "partyId");

ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_businessDocument_fkey"
FOREIGN KEY ("businessDocumentId") REFERENCES "BusinessDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockBatch"
ADD COLUMN "businessDocumentId" TEXT;

ALTER TABLE "StockBatch"
ADD CONSTRAINT "StockBatch_businessDocument_fkey"
FOREIGN KEY ("businessDocumentId") REFERENCES "BusinessDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StockBatch_company_businessDocumentId_idx"
ON "StockBatch" ("companyId", "businessDocumentId");
