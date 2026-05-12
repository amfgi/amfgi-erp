CREATE TYPE "WorkflowApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "WorkflowApproval" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "workflowType" TEXT NOT NULL,
  "status" "WorkflowApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "payload" JSONB,
  CONSTRAINT "WorkflowApproval_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkflowApproval"
ADD CONSTRAINT "WorkflowApproval_company_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowApproval"
ADD CONSTRAINT "WorkflowApproval_requestedBy_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkflowApproval"
ADD CONSTRAINT "WorkflowApproval_decidedBy_fkey"
FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "WorkflowApproval_company_workflow_entity_uniq"
ON "WorkflowApproval" ("companyId", "workflowType", "entityType", "entityId");

CREATE INDEX "WorkflowApproval_company_status_requested_idx"
ON "WorkflowApproval" ("companyId", "status", "requestedAt");

CREATE INDEX "WorkflowApproval_company_workflow_status_idx"
ON "WorkflowApproval" ("companyId", "workflowType", "status");
