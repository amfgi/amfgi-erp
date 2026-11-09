-- Quotation document types and uploaded versions. Existing rows are not changed.

CREATE TABLE "SalesDocumentType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameKey" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesDocumentType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesDocumentType_companyId_nameKey_key" ON "SalesDocumentType"("companyId", "nameKey");

CREATE INDEX "SalesDocumentType_companyId_name_idx" ON "SalesDocumentType"("companyId", "name");

ALTER TABLE "SalesDocumentType" ADD CONSTRAINT "SalesDocumentType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SalesQuotationDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesQueryId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "viewerUrl" TEXT NOT NULL,
    "note" VARCHAR(500),
    "uploadedById" TEXT NOT NULL,
    "carriedToPurchaseOrder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesQuotationDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesQuotationDocument_companyId_salesQueryId_createdAt_idx" ON "SalesQuotationDocument"("companyId", "salesQueryId", "createdAt");

CREATE INDEX "SalesQuotationDocument_typeId_idx" ON "SalesQuotationDocument"("typeId");

ALTER TABLE "SalesQuotationDocument" ADD CONSTRAINT "SalesQuotationDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesQuotationDocument" ADD CONSTRAINT "SalesQuotationDocument_companyId_salesQueryId_fkey" FOREIGN KEY ("companyId", "salesQueryId") REFERENCES "SalesQuery"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesQuotationDocument" ADD CONSTRAINT "SalesQuotationDocument_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SalesDocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesQuotationDocument" ADD CONSTRAINT "SalesQuotationDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
