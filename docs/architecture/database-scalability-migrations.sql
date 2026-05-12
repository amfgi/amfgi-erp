-- AMFGI Future-Ready Database Blueprint
-- This file is a planning artifact, not an executable single migration.
-- Split into timestamped migration files during implementation.

-- =========================================================
-- Phase A: Company foundation + policy spine
-- =========================================================

-- CREATE TYPE "CompanyOnboardingStatus" AS ENUM
-- ('NEW','PROFILE_READY','WAREHOUSE_READY','OPERATIONAL');

-- ALTER TABLE "Company"
-- ADD COLUMN "onboardingStatus" "CompanyOnboardingStatus" NOT NULL DEFAULT 'NEW',
-- ADD COLUMN "foundationChecklist" JSONB,
-- ADD COLUMN "operationalSettings" JSONB,
-- ADD COLUMN "settingsVersion" INTEGER NOT NULL DEFAULT 1;

-- =========================================================
-- Phase B: Transaction extensibility
-- =========================================================

-- ALTER TABLE "Transaction"
-- ADD COLUMN "sourceModule" TEXT NOT NULL DEFAULT 'stock',
-- ADD COLUMN "referenceType" TEXT,
-- ADD COLUMN "referenceId" TEXT,
-- ADD COLUMN "idempotencyKey" TEXT,
-- ADD COLUMN "postingGroupId" TEXT,
-- ADD COLUMN "meta" JSONB,
-- ADD COLUMN "businessDocumentId" TEXT;

-- CREATE INDEX "Transaction_company_source_module_date_idx"
-- ON "Transaction" ("companyId", "sourceModule", "date");

-- CREATE INDEX "Transaction_company_reference_idx"
-- ON "Transaction" ("companyId", "referenceType", "referenceId");

-- CREATE INDEX "Transaction_company_posting_group_idx"
-- ON "Transaction" ("companyId", "postingGroupId");

-- CREATE INDEX "Transaction_company_business_document_idx"
-- ON "Transaction" ("companyId", "businessDocumentId");

-- SQL-only partial unique idempotency guard:
-- CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_company_idempotency_key_uniq"
-- ON "Transaction"("companyId", "idempotencyKey")
-- WHERE "idempotencyKey" IS NOT NULL;

-- =========================================================
-- Phase C: DomainEvent
-- =========================================================

-- CREATE TABLE "DomainEvent" (
--   "id" TEXT PRIMARY KEY,
--   "companyId" TEXT NOT NULL,
--   "module" TEXT NOT NULL,
--   "eventType" TEXT NOT NULL,
--   "entityType" TEXT NOT NULL,
--   "entityId" TEXT NOT NULL,
--   "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   "actorUserId" TEXT,
--   "correlationId" TEXT,
--   "payload" JSONB,
--   "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
-- );

-- ALTER TABLE "DomainEvent"
-- ADD CONSTRAINT "DomainEvent_company_fkey"
-- FOREIGN KEY ("companyId") REFERENCES "Company"("id")
-- ON DELETE CASCADE ON UPDATE CASCADE;

-- ALTER TABLE "DomainEvent"
-- ADD CONSTRAINT "DomainEvent_actorUser_fkey"
-- FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
-- ON DELETE SET NULL ON UPDATE CASCADE;

-- CREATE INDEX "DomainEvent_company_module_occurred_idx"
-- ON "DomainEvent" ("companyId", "module", "occurredAt");

-- CREATE INDEX "DomainEvent_company_entity_occurred_idx"
-- ON "DomainEvent" ("companyId", "entityType", "entityId", "occurredAt");

-- CREATE INDEX "DomainEvent_correlation_idx"
-- ON "DomainEvent" ("correlationId");

-- =========================================================
-- Phase D: BusinessDocument
-- =========================================================

-- CREATE TYPE "BusinessDocumentStatus" AS ENUM
-- ('DRAFT','SUBMITTED','APPROVED','POSTED','VOID');

-- CREATE TABLE "BusinessDocument" (
--   "id" TEXT PRIMARY KEY,
--   "companyId" TEXT NOT NULL,
--   "docType" TEXT NOT NULL,
--   "docNumber" TEXT NOT NULL,
--   "docDate" TIMESTAMP(3) NOT NULL,
--   "status" "BusinessDocumentStatus" NOT NULL DEFAULT 'DRAFT',
--   "sourceModule" TEXT NOT NULL,
--   "partyType" TEXT,
--   "partyId" TEXT,
--   "currencyCode" TEXT,
--   "fxRate" DECIMAL(18,6),
--   "totals" JSONB,
--   "meta" JSONB,
--   "createdById" TEXT,
--   "approvedById" TEXT,
--   "approvedAt" TIMESTAMP(3),
--   "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
-- );

-- ALTER TABLE "BusinessDocument"
-- ADD CONSTRAINT "BusinessDocument_company_fkey"
-- FOREIGN KEY ("companyId") REFERENCES "Company"("id")
-- ON DELETE CASCADE ON UPDATE CASCADE;

-- ALTER TABLE "BusinessDocument"
-- ADD CONSTRAINT "BusinessDocument_createdBy_fkey"
-- FOREIGN KEY ("createdById") REFERENCES "User"("id")
-- ON DELETE SET NULL ON UPDATE CASCADE;

-- ALTER TABLE "BusinessDocument"
-- ADD CONSTRAINT "BusinessDocument_approvedBy_fkey"
-- FOREIGN KEY ("approvedById") REFERENCES "User"("id")
-- ON DELETE SET NULL ON UPDATE CASCADE;

-- CREATE UNIQUE INDEX "BusinessDocument_company_type_number_uniq"
-- ON "BusinessDocument" ("companyId", "docType", "docNumber");

-- CREATE INDEX "BusinessDocument_company_type_status_date_idx"
-- ON "BusinessDocument" ("companyId", "docType", "status", "docDate");

-- CREATE INDEX "BusinessDocument_company_source_date_idx"
-- ON "BusinessDocument" ("companyId", "sourceModule", "docDate");

-- CREATE INDEX "BusinessDocument_company_party_idx"
-- ON "BusinessDocument" ("companyId", "partyType", "partyId");

-- Optional links:
-- ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_businessDocument_fkey"
-- FOREIGN KEY ("businessDocumentId") REFERENCES "BusinessDocument"("id")
-- ON DELETE SET NULL ON UPDATE CASCADE;

-- ALTER TABLE "StockBatch" ADD COLUMN "businessDocumentId" TEXT;
-- ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_businessDocument_fkey"
-- FOREIGN KEY ("businessDocumentId") REFERENCES "BusinessDocument"("id")
-- ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================
-- Phase E: WorkflowApproval
-- =========================================================

-- CREATE TYPE "WorkflowApprovalStatus" AS ENUM
-- ('PENDING','APPROVED','REJECTED','CANCELLED');

-- CREATE TABLE "WorkflowApproval" (
--   "id" TEXT PRIMARY KEY,
--   "companyId" TEXT NOT NULL,
--   "entityType" TEXT NOT NULL,
--   "entityId" TEXT NOT NULL,
--   "workflowType" TEXT NOT NULL,
--   "status" "WorkflowApprovalStatus" NOT NULL DEFAULT 'PENDING',
--   "requestedById" TEXT,
--   "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   "decidedById" TEXT,
--   "decidedAt" TIMESTAMP(3),
--   "decisionNote" TEXT,
--   "payload" JSONB
-- );

-- ALTER TABLE "WorkflowApproval"
-- ADD CONSTRAINT "WorkflowApproval_company_fkey"
-- FOREIGN KEY ("companyId") REFERENCES "Company"("id")
-- ON DELETE CASCADE ON UPDATE CASCADE;

-- ALTER TABLE "WorkflowApproval"
-- ADD CONSTRAINT "WorkflowApproval_requestedBy_fkey"
-- FOREIGN KEY ("requestedById") REFERENCES "User"("id")
-- ON DELETE SET NULL ON UPDATE CASCADE;

-- ALTER TABLE "WorkflowApproval"
-- ADD CONSTRAINT "WorkflowApproval_decidedBy_fkey"
-- FOREIGN KEY ("decidedById") REFERENCES "User"("id")
-- ON DELETE SET NULL ON UPDATE CASCADE;

-- CREATE UNIQUE INDEX "WorkflowApproval_company_workflow_entity_uniq"
-- ON "WorkflowApproval" ("companyId", "workflowType", "entityType", "entityId");

-- CREATE INDEX "WorkflowApproval_company_status_requested_idx"
-- ON "WorkflowApproval" ("companyId", "status", "requestedAt");

-- CREATE INDEX "WorkflowApproval_company_workflow_status_idx"
-- ON "WorkflowApproval" ("companyId", "workflowType", "status");
