-- Saved custom quotation sections. Existing quotations are not changed.

CREATE TABLE "QuotationCustomSection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameKey" VARCHAR(80) NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationCustomSection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuotationCustomSection_companyId_nameKey_key" ON "QuotationCustomSection"("companyId", "nameKey");

CREATE INDEX "QuotationCustomSection_companyId_name_idx" ON "QuotationCustomSection"("companyId", "name");

ALTER TABLE "QuotationCustomSection" ADD CONSTRAINT "QuotationCustomSection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
