-- Saved "Not in our scope" and "Specification & Note" presets. Existing quotations are not changed.

CREATE TABLE "QuotationSectionPreset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameKey" VARCHAR(80) NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationSectionPreset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuotationSectionPreset_companyId_kind_nameKey_key" ON "QuotationSectionPreset"("companyId", "kind", "nameKey");

CREATE INDEX "QuotationSectionPreset_companyId_kind_name_idx" ON "QuotationSectionPreset"("companyId", "kind", "name");

ALTER TABLE "QuotationSectionPreset" ADD CONSTRAINT "QuotationSectionPreset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
