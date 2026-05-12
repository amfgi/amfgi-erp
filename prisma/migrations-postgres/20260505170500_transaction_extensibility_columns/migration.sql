ALTER TABLE "Transaction"
ADD COLUMN "sourceModule" TEXT NOT NULL DEFAULT 'stock',
ADD COLUMN "referenceType" TEXT,
ADD COLUMN "referenceId" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "postingGroupId" TEXT,
ADD COLUMN "meta" JSONB,
ADD COLUMN "businessDocumentId" TEXT;

CREATE INDEX "Transaction_company_source_module_date_idx"
ON "Transaction" ("companyId", "sourceModule", "date");

CREATE INDEX "Transaction_company_reference_idx"
ON "Transaction" ("companyId", "referenceType", "referenceId");

CREATE INDEX "Transaction_company_posting_group_idx"
ON "Transaction" ("companyId", "postingGroupId");

CREATE INDEX "Transaction_company_business_document_idx"
ON "Transaction" ("companyId", "businessDocumentId");
