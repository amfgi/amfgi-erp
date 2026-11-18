-- HR fines. New tables only. Existing rows are not changed.
CREATE TYPE "EmployeeFineStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "EmployeeFine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fineDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "EmployeeFineStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeFine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeFineFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fineId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeFineFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeFine_companyId_status_fineDate_idx" ON "EmployeeFine"("companyId", "status", "fineDate");
CREATE INDEX "EmployeeFine_companyId_employeeId_fineDate_idx" ON "EmployeeFine"("companyId", "employeeId", "fineDate");
CREATE INDEX "EmployeeFineFile_companyId_fineId_idx" ON "EmployeeFineFile"("companyId", "fineId");

ALTER TABLE "EmployeeFine" ADD CONSTRAINT "EmployeeFine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeFine" ADD CONSTRAINT "EmployeeFine_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeFine" ADD CONSTRAINT "EmployeeFine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeFine" ADD CONSTRAINT "EmployeeFine_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeFineFile" ADD CONSTRAINT "EmployeeFineFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeFineFile" ADD CONSTRAINT "EmployeeFineFile_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "EmployeeFine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
