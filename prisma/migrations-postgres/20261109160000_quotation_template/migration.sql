-- Saved quotation templates. Existing quotations are not changed.

CREATE TABLE "QuotationTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameKey" VARCHAR(80) NOT NULL,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuotationTemplate_companyId_nameKey_key" ON "QuotationTemplate"("companyId", "nameKey");

CREATE INDEX "QuotationTemplate_companyId_name_idx" ON "QuotationTemplate"("companyId", "name");

ALTER TABLE "QuotationTemplate" ADD CONSTRAINT "QuotationTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
