-- Sales pipeline: query, quotation options/lines, and drive attachments

CREATE TYPE "SalesStage" AS ENUM ('QUERY', 'QUOTATION', 'OPERATIONS');
CREATE TYPE "SalesClosure" AS ENUM ('OPEN', 'LOST', 'CANCELLED');
CREATE TYPE "SalesQuotationMode" AS ENUM ('SINGLE', 'MULTIPLE');
CREATE TYPE "SalesAttachmentKind" AS ENUM ('CLIENT', 'PO');

CREATE TABLE "SalesQuery" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "queryNumber" VARCHAR(90) NOT NULL,
    "queryNumberKey" VARCHAR(90) NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" VARCHAR(100) NOT NULL,
    "projectLocation" VARCHAR(200) NOT NULL,
    "projectDescription" VARCHAR(1000) NOT NULL,
    "projectScope" VARCHAR(120) NOT NULL,
    "salesmanId" TEXT NOT NULL,
    "extraNotes" TEXT,
    "stage" "SalesStage" NOT NULL DEFAULT 'QUERY',
    "closure" "SalesClosure" NOT NULL DEFAULT 'OPEN',
    "closureReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "quotationRevision" INTEGER NOT NULL DEFAULT 0,
    "quotationIssuedAt" TIMESTAMP(3),
    "startDate" DATE,
    "quotationMode" "SalesQuotationMode" NOT NULL DEFAULT 'SINGLE',
    "acceptedOptionId" TEXT,
    "poNumber" VARCHAR(100),
    "poNumberKey" VARCHAR(100),
    "poDate" DATE,
    "poValue" DECIMAL(18,2),
    "budgetDetails" TEXT,
    "operationsNotes" TEXT,
    "jobId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesQuery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesQuotationOption" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesQueryId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesQuotationOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesQuotationLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "item" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesQuotationLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesAttachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesQueryId" TEXT NOT NULL,
    "kind" "SalesAttachmentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "viewerUrl" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesQuery_acceptedOptionId_key" ON "SalesQuery"("acceptedOptionId");
CREATE UNIQUE INDEX "SalesQuery_companyId_id_key" ON "SalesQuery"("companyId", "id");
CREATE UNIQUE INDEX "SalesQuery_companyId_queryNumberKey_key" ON "SalesQuery"("companyId", "queryNumberKey");
CREATE UNIQUE INDEX "SalesQuery_companyId_poNumberKey_key" ON "SalesQuery"("companyId", "poNumberKey");
CREATE UNIQUE INDEX "SalesQuery_companyId_jobId_key" ON "SalesQuery"("companyId", "jobId");
CREATE INDEX "SalesQuery_companyId_stage_closure_idx" ON "SalesQuery"("companyId", "stage", "closure");
CREATE INDEX "SalesQuery_companyId_customerId_idx" ON "SalesQuery"("companyId", "customerId");
CREATE INDEX "SalesQuery_companyId_salesmanId_idx" ON "SalesQuery"("companyId", "salesmanId");

CREATE UNIQUE INDEX "SalesQuotationOption_companyId_id_key" ON "SalesQuotationOption"("companyId", "id");
CREATE INDEX "SalesQuotationOption_companyId_salesQueryId_sortOrder_idx" ON "SalesQuotationOption"("companyId", "salesQueryId", "sortOrder");

CREATE INDEX "SalesQuotationLine_companyId_optionId_sortOrder_idx" ON "SalesQuotationLine"("companyId", "optionId", "sortOrder");

CREATE INDEX "SalesAttachment_companyId_salesQueryId_kind_idx" ON "SalesAttachment"("companyId", "salesQueryId", "kind");

ALTER TABLE "SalesQuery" ADD CONSTRAINT "SalesQuery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesQuery" ADD CONSTRAINT "SalesQuery_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "Customer"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesQuery" ADD CONSTRAINT "SalesQuery_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesQuery" ADD CONSTRAINT "SalesQuery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesQuery" ADD CONSTRAINT "SalesQuery_companyId_jobId_fkey" FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesQuotationOption" ADD CONSTRAINT "SalesQuotationOption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesQuotationOption" ADD CONSTRAINT "SalesQuotationOption_companyId_salesQueryId_fkey" FOREIGN KEY ("companyId", "salesQueryId") REFERENCES "SalesQuery"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesQuery" ADD CONSTRAINT "SalesQuery_acceptedOptionId_fkey" FOREIGN KEY ("acceptedOptionId") REFERENCES "SalesQuotationOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_companyId_optionId_fkey" FOREIGN KEY ("companyId", "optionId") REFERENCES "SalesQuotationOption"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesAttachment" ADD CONSTRAINT "SalesAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesAttachment" ADD CONSTRAINT "SalesAttachment_companyId_salesQueryId_fkey" FOREIGN KEY ("companyId", "salesQueryId") REFERENCES "SalesQuery"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesAttachment" ADD CONSTRAINT "SalesAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
