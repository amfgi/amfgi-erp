-- Idempotent: safe when objects were already changed manually or by partial apply.

DROP TABLE IF EXISTS "GeofenceAttendanceEvent" CASCADE;
DROP TABLE IF EXISTS "GeofenceZone" CASCADE;
DROP TYPE IF EXISTS "GeofenceAttendanceEventType";
DROP TYPE IF EXISTS "GeofenceValidationStatus";

DROP INDEX IF EXISTS "Company_onboarding_warehouse_active_idx";
DROP INDEX IF EXISTS "Company_operational_settings_gin_idx";
DROP INDEX IF EXISTS "Company_settings_version_idx";
DROP INDEX IF EXISTS "Company_stockFallbackWarehouseId_idx";
DROP INDEX IF EXISTS "JobItemProgressEntry_companyId_jobItemId_entryDate_idx";

ALTER TABLE "AttendanceEntry" DROP COLUMN IF EXISTS "expectedShiftEnd";
ALTER TABLE "AttendanceEntry" DROP COLUMN IF EXISTS "expectedShiftStart";

ALTER TABLE "BusinessDocument" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "Company" DROP COLUMN IF EXISTS "letterheadDriveId";
ALTER TABLE "Company" ALTER COLUMN "warehouseMode" SET DEFAULT 'REQUIRED';

ALTER TABLE "DomainEventTypeRegistry" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "Employee" DROP COLUMN IF EXISTS "photoDriveId";
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;

ALTER TABLE "EmployeeDocument" DROP COLUMN IF EXISTS "mediaDriveId";
ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT;

ALTER TABLE "GlobalSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "JobItemProgressEntry" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "MaterialAssemblyComponent" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "signedCopyDriveId";

ALTER TABLE "User" DROP COLUMN IF EXISTS "imageDriveId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "signatureDriveId";

CREATE TABLE IF NOT EXISTS "QuantityLogDaySubmission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" TEXT NOT NULL,
    CONSTRAINT "QuantityLogDaySubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuantityLogAdhocJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuantityLogAdhocJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QuantityLogDaySubmission_companyId_workDate_idx"
  ON "QuantityLogDaySubmission"("companyId", "workDate");
CREATE UNIQUE INDEX IF NOT EXISTS "QuantityLogDaySubmission_companyId_workDate_key"
  ON "QuantityLogDaySubmission"("companyId", "workDate");
CREATE INDEX IF NOT EXISTS "QuantityLogAdhocJob_companyId_workDate_idx"
  ON "QuantityLogAdhocJob"("companyId", "workDate");
CREATE UNIQUE INDEX IF NOT EXISTS "QuantityLogAdhocJob_companyId_workDate_jobId_key"
  ON "QuantityLogAdhocJob"("companyId", "workDate", "jobId");

DO $rename_fk$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BusinessDocument_approvedBy_fkey') THEN
    ALTER TABLE "BusinessDocument" RENAME CONSTRAINT "BusinessDocument_approvedBy_fkey" TO "BusinessDocument_approvedById_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BusinessDocument_company_fkey') THEN
    ALTER TABLE "BusinessDocument" RENAME CONSTRAINT "BusinessDocument_company_fkey" TO "BusinessDocument_companyId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BusinessDocument_createdBy_fkey') THEN
    ALTER TABLE "BusinessDocument" RENAME CONSTRAINT "BusinessDocument_createdBy_fkey" TO "BusinessDocument_createdById_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Company_companyId_stockFallbackWarehouseId_fkey') THEN
    ALTER TABLE "Company" RENAME CONSTRAINT "Company_companyId_stockFallbackWarehouseId_fkey" TO "Company_id_stockFallbackWarehouseId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DomainEvent_actorUser_fkey') THEN
    ALTER TABLE "DomainEvent" RENAME CONSTRAINT "DomainEvent_actorUser_fkey" TO "DomainEvent_actorUserId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DomainEvent_company_fkey') THEN
    ALTER TABLE "DomainEvent" RENAME CONSTRAINT "DomainEvent_company_fkey" TO "DomainEvent_companyId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MaterialAssemblyComponent_assemblyMaterial_fkey') THEN
    ALTER TABLE "MaterialAssemblyComponent" RENAME CONSTRAINT "MaterialAssemblyComponent_assemblyMaterial_fkey" TO "MaterialAssemblyComponent_companyId_assemblyMaterialId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MaterialAssemblyComponent_componentMaterial_fkey') THEN
    ALTER TABLE "MaterialAssemblyComponent" RENAME CONSTRAINT "MaterialAssemblyComponent_componentMaterial_fkey" TO "MaterialAssemblyComponent_companyId_componentMaterialId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockBatch_company_businessDocument_fkey') THEN
    ALTER TABLE "StockBatch" RENAME CONSTRAINT "StockBatch_company_businessDocument_fkey" TO "StockBatch_companyId_businessDocumentId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_company_businessDocument_fkey') THEN
    ALTER TABLE "Transaction" RENAME CONSTRAINT "Transaction_company_businessDocument_fkey" TO "Transaction_companyId_businessDocumentId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkflowApproval_company_fkey') THEN
    ALTER TABLE "WorkflowApproval" RENAME CONSTRAINT "WorkflowApproval_company_fkey" TO "WorkflowApproval_companyId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkflowApproval_decidedBy_fkey') THEN
    ALTER TABLE "WorkflowApproval" RENAME CONSTRAINT "WorkflowApproval_decidedBy_fkey" TO "WorkflowApproval_decidedById_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkflowApproval_requestedBy_fkey') THEN
    ALTER TABLE "WorkflowApproval" RENAME CONSTRAINT "WorkflowApproval_requestedBy_fkey" TO "WorkflowApproval_requestedById_fkey";
  END IF;
END $rename_fk$;

DO $add_fk$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuantityLogDaySubmission_companyId_fkey') THEN
    ALTER TABLE "QuantityLogDaySubmission" ADD CONSTRAINT "QuantityLogDaySubmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuantityLogDaySubmission_submittedById_fkey') THEN
    ALTER TABLE "QuantityLogDaySubmission" ADD CONSTRAINT "QuantityLogDaySubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuantityLogAdhocJob_companyId_fkey') THEN
    ALTER TABLE "QuantityLogAdhocJob" ADD CONSTRAINT "QuantityLogAdhocJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuantityLogAdhocJob_companyId_jobId_fkey') THEN
    ALTER TABLE "QuantityLogAdhocJob" ADD CONSTRAINT "QuantityLogAdhocJob_companyId_jobId_fkey" FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuantityLogAdhocJob_createdById_fkey') THEN
    ALTER TABLE "QuantityLogAdhocJob" ADD CONSTRAINT "QuantityLogAdhocJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $add_fk$;

DO $rename_idx$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'BusinessDocument_company_docType_docNumber_key') THEN
    ALTER INDEX "BusinessDocument_company_docType_docNumber_key" RENAME TO "BusinessDocument_companyId_docType_docNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'BusinessDocument_company_docType_status_docDate_idx') THEN
    ALTER INDEX "BusinessDocument_company_docType_status_docDate_idx" RENAME TO "BusinessDocument_companyId_docType_status_docDate_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'BusinessDocument_company_partyType_partyId_idx') THEN
    ALTER INDEX "BusinessDocument_company_partyType_partyId_idx" RENAME TO "BusinessDocument_companyId_partyType_partyId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'BusinessDocument_company_sourceModule_docDate_idx') THEN
    ALTER INDEX "BusinessDocument_company_sourceModule_docDate_idx" RENAME TO "BusinessDocument_companyId_sourceModule_docDate_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'DomainEvent_company_entity_occurred_idx') THEN
    ALTER INDEX "DomainEvent_company_entity_occurred_idx" RENAME TO "DomainEvent_companyId_entityType_entityId_occurredAt_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'DomainEvent_company_module_occurred_idx') THEN
    ALTER INDEX "DomainEvent_company_module_occurred_idx" RENAME TO "DomainEvent_companyId_module_occurredAt_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'DomainEvent_correlation_idx') THEN
    ALTER INDEX "DomainEvent_correlation_idx" RENAME TO "DomainEvent_correlationId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'FormulaLibraryVersion_companyId_formulaLibraryId_versionNumbe_k') THEN
    ALTER INDEX "FormulaLibraryVersion_companyId_formulaLibraryId_versionNumbe_k" RENAME TO "FormulaLibraryVersion_companyId_formulaLibraryId_versionNum_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'JobItemProgressEntry_companyId_jobItemId_trackerId_entryDate_id') THEN
    ALTER INDEX "JobItemProgressEntry_companyId_jobItemId_trackerId_entryDate_id" RENAME TO "JobItemProgressEntry_companyId_jobItemId_trackerId_entryDat_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'MaterialAssemblyComponent_assemblyMaterialId_componentMaterialI') THEN
    ALTER INDEX "MaterialAssemblyComponent_assemblyMaterialId_componentMaterialI" RENAME TO "MaterialAssemblyComponent_assemblyMaterialId_componentMater_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'StockBatch_company_businessDocumentId_idx') THEN
    ALTER INDEX "StockBatch_company_businessDocumentId_idx" RENAME TO "StockBatch_companyId_businessDocumentId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Transaction_company_business_document_idx') THEN
    ALTER INDEX "Transaction_company_business_document_idx" RENAME TO "Transaction_companyId_businessDocumentId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Transaction_company_posting_group_idx') THEN
    ALTER INDEX "Transaction_company_posting_group_idx" RENAME TO "Transaction_companyId_postingGroupId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Transaction_company_reference_idx') THEN
    ALTER INDEX "Transaction_company_reference_idx" RENAME TO "Transaction_companyId_referenceType_referenceId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Transaction_company_source_module_date_idx') THEN
    ALTER INDEX "Transaction_company_source_module_date_idx" RENAME TO "Transaction_companyId_sourceModule_date_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'WorkflowApproval_company_status_requested_idx') THEN
    ALTER INDEX "WorkflowApproval_company_status_requested_idx" RENAME TO "WorkflowApproval_companyId_status_requestedAt_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'WorkflowApproval_company_workflow_entity_uniq') THEN
    ALTER INDEX "WorkflowApproval_company_workflow_entity_uniq" RENAME TO "WorkflowApproval_companyId_workflowType_entityType_entityId_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'WorkflowApproval_company_workflow_status_idx') THEN
    ALTER INDEX "WorkflowApproval_company_workflow_status_idx" RENAME TO "WorkflowApproval_companyId_workflowType_status_idx";
  END IF;
END $rename_idx$;
