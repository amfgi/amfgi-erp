/*
  Warnings:

  - You are about to drop the column `expectedShiftEnd` on the `AttendanceEntry` table. All the data in the column will be lost.
  - You are about to drop the column `expectedShiftStart` on the `AttendanceEntry` table. All the data in the column will be lost.
  - You are about to drop the column `letterheadDriveId` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `photoDriveId` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `mediaDriveId` on the `EmployeeDocument` table. All the data in the column will be lost.
  - You are about to drop the column `signedCopyDriveId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `imageDriveId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `signatureDriveId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `GeofenceAttendanceEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GeofenceZone` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GeofenceAttendanceEvent" DROP CONSTRAINT "GeofenceAttendanceEvent_companyId_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "GeofenceAttendanceEvent" DROP CONSTRAINT "GeofenceAttendanceEvent_companyId_fkey";

-- DropForeignKey
ALTER TABLE "GeofenceAttendanceEvent" DROP CONSTRAINT "GeofenceAttendanceEvent_companyId_zoneId_fkey";

-- DropForeignKey
ALTER TABLE "GeofenceZone" DROP CONSTRAINT "GeofenceZone_companyId_fkey";

-- DropIndex
DROP INDEX "Company_onboarding_warehouse_active_idx";

-- DropIndex
DROP INDEX "Company_operational_settings_gin_idx";

-- DropIndex
DROP INDEX "Company_settings_version_idx";

-- DropIndex
DROP INDEX "Company_stockFallbackWarehouseId_idx";

-- DropIndex
DROP INDEX "JobItemProgressEntry_companyId_jobItemId_entryDate_idx";

-- AlterTable
ALTER TABLE "AttendanceEntry" DROP COLUMN "expectedShiftEnd",
DROP COLUMN "expectedShiftStart";

-- AlterTable
ALTER TABLE "BusinessDocument" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "letterheadDriveId",
ALTER COLUMN "warehouseMode" SET DEFAULT 'REQUIRED';

-- AlterTable
ALTER TABLE "DomainEventTypeRegistry" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "photoDriveId",
ADD COLUMN     "photoUrl" TEXT;

-- AlterTable
ALTER TABLE "EmployeeDocument" DROP COLUMN "mediaDriveId",
ADD COLUMN     "mediaUrl" TEXT;

-- AlterTable
ALTER TABLE "GlobalSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "JobItemProgressEntry" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MaterialAssemblyComponent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "signedCopyDriveId";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "imageDriveId",
DROP COLUMN "signatureDriveId";

-- DropTable
DROP TABLE "GeofenceAttendanceEvent";

-- DropTable
DROP TABLE "GeofenceZone";

-- DropEnum
DROP TYPE "GeofenceAttendanceEventType";

-- DropEnum
DROP TYPE "GeofenceValidationStatus";

-- CreateTable
CREATE TABLE "QuantityLogDaySubmission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" TEXT NOT NULL,

    CONSTRAINT "QuantityLogDaySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantityLogAdhocJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuantityLogAdhocJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuantityLogDaySubmission_companyId_workDate_idx" ON "QuantityLogDaySubmission"("companyId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "QuantityLogDaySubmission_companyId_workDate_key" ON "QuantityLogDaySubmission"("companyId", "workDate");

-- CreateIndex
CREATE INDEX "QuantityLogAdhocJob_companyId_workDate_idx" ON "QuantityLogAdhocJob"("companyId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "QuantityLogAdhocJob_companyId_workDate_jobId_key" ON "QuantityLogAdhocJob"("companyId", "workDate", "jobId");

-- RenameForeignKey
ALTER TABLE "BusinessDocument" RENAME CONSTRAINT "BusinessDocument_approvedBy_fkey" TO "BusinessDocument_approvedById_fkey";

-- RenameForeignKey
ALTER TABLE "BusinessDocument" RENAME CONSTRAINT "BusinessDocument_company_fkey" TO "BusinessDocument_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "BusinessDocument" RENAME CONSTRAINT "BusinessDocument_createdBy_fkey" TO "BusinessDocument_createdById_fkey";

-- RenameForeignKey
ALTER TABLE "Company" RENAME CONSTRAINT "Company_companyId_stockFallbackWarehouseId_fkey" TO "Company_id_stockFallbackWarehouseId_fkey";

-- RenameForeignKey
ALTER TABLE "DomainEvent" RENAME CONSTRAINT "DomainEvent_actorUser_fkey" TO "DomainEvent_actorUserId_fkey";

-- RenameForeignKey
ALTER TABLE "DomainEvent" RENAME CONSTRAINT "DomainEvent_company_fkey" TO "DomainEvent_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "MaterialAssemblyComponent" RENAME CONSTRAINT "MaterialAssemblyComponent_assemblyMaterial_fkey" TO "MaterialAssemblyComponent_companyId_assemblyMaterialId_fkey";

-- RenameForeignKey
ALTER TABLE "MaterialAssemblyComponent" RENAME CONSTRAINT "MaterialAssemblyComponent_componentMaterial_fkey" TO "MaterialAssemblyComponent_companyId_componentMaterialId_fkey";

-- RenameForeignKey
ALTER TABLE "StockBatch" RENAME CONSTRAINT "StockBatch_company_businessDocument_fkey" TO "StockBatch_companyId_businessDocumentId_fkey";

-- RenameForeignKey
ALTER TABLE "Transaction" RENAME CONSTRAINT "Transaction_company_businessDocument_fkey" TO "Transaction_companyId_businessDocumentId_fkey";

-- RenameForeignKey
ALTER TABLE "WorkflowApproval" RENAME CONSTRAINT "WorkflowApproval_company_fkey" TO "WorkflowApproval_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "WorkflowApproval" RENAME CONSTRAINT "WorkflowApproval_decidedBy_fkey" TO "WorkflowApproval_decidedById_fkey";

-- RenameForeignKey
ALTER TABLE "WorkflowApproval" RENAME CONSTRAINT "WorkflowApproval_requestedBy_fkey" TO "WorkflowApproval_requestedById_fkey";

-- AddForeignKey
ALTER TABLE "QuantityLogDaySubmission" ADD CONSTRAINT "QuantityLogDaySubmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantityLogDaySubmission" ADD CONSTRAINT "QuantityLogDaySubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantityLogAdhocJob" ADD CONSTRAINT "QuantityLogAdhocJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantityLogAdhocJob" ADD CONSTRAINT "QuantityLogAdhocJob_companyId_jobId_fkey" FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantityLogAdhocJob" ADD CONSTRAINT "QuantityLogAdhocJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "BusinessDocument_company_docType_docNumber_key" RENAME TO "BusinessDocument_companyId_docType_docNumber_key";

-- RenameIndex
ALTER INDEX "BusinessDocument_company_docType_status_docDate_idx" RENAME TO "BusinessDocument_companyId_docType_status_docDate_idx";

-- RenameIndex
ALTER INDEX "BusinessDocument_company_partyType_partyId_idx" RENAME TO "BusinessDocument_companyId_partyType_partyId_idx";

-- RenameIndex
ALTER INDEX "BusinessDocument_company_sourceModule_docDate_idx" RENAME TO "BusinessDocument_companyId_sourceModule_docDate_idx";

-- RenameIndex
ALTER INDEX "DomainEvent_company_entity_occurred_idx" RENAME TO "DomainEvent_companyId_entityType_entityId_occurredAt_idx";

-- RenameIndex
ALTER INDEX "DomainEvent_company_module_occurred_idx" RENAME TO "DomainEvent_companyId_module_occurredAt_idx";

-- RenameIndex
ALTER INDEX "DomainEvent_correlation_idx" RENAME TO "DomainEvent_correlationId_idx";

-- RenameIndex
ALTER INDEX "FormulaLibraryVersion_companyId_formulaLibraryId_versionNumbe_k" RENAME TO "FormulaLibraryVersion_companyId_formulaLibraryId_versionNum_key";

-- RenameIndex
ALTER INDEX "JobItemProgressEntry_companyId_jobItemId_trackerId_entryDate_id" RENAME TO "JobItemProgressEntry_companyId_jobItemId_trackerId_entryDat_idx";

-- RenameIndex
ALTER INDEX "MaterialAssemblyComponent_assemblyMaterialId_componentMaterialI" RENAME TO "MaterialAssemblyComponent_assemblyMaterialId_componentMater_key";

-- RenameIndex
ALTER INDEX "StockBatch_company_businessDocumentId_idx" RENAME TO "StockBatch_companyId_businessDocumentId_idx";

-- RenameIndex
ALTER INDEX "Transaction_company_business_document_idx" RENAME TO "Transaction_companyId_businessDocumentId_idx";

-- RenameIndex
ALTER INDEX "Transaction_company_posting_group_idx" RENAME TO "Transaction_companyId_postingGroupId_idx";

-- RenameIndex
ALTER INDEX "Transaction_company_reference_idx" RENAME TO "Transaction_companyId_referenceType_referenceId_idx";

-- RenameIndex
ALTER INDEX "Transaction_company_source_module_date_idx" RENAME TO "Transaction_companyId_sourceModule_date_idx";

-- RenameIndex
ALTER INDEX "WorkflowApproval_company_status_requested_idx" RENAME TO "WorkflowApproval_companyId_status_requestedAt_idx";

-- RenameIndex
ALTER INDEX "WorkflowApproval_company_workflow_entity_uniq" RENAME TO "WorkflowApproval_companyId_workflowType_entityType_entityId_key";

-- RenameIndex
ALTER INDEX "WorkflowApproval_company_workflow_status_idx" RENAME TO "WorkflowApproval_companyId_workflowType_status_idx";
