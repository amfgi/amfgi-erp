-- Saved quotation terms, keyed by the name a user types. Existing quotations are not changed.

CREATE TABLE "QuotationTermsTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameKey" VARCHAR(80) NOT NULL,
    "rows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationTermsTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuotationTermsTemplate_companyId_nameKey_key" ON "QuotationTermsTemplate"("companyId", "nameKey");

CREATE INDEX "QuotationTermsTemplate_companyId_name_idx" ON "QuotationTermsTemplate"("companyId", "name");

ALTER TABLE "QuotationTermsTemplate" ADD CONSTRAINT "QuotationTermsTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
