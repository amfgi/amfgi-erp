-- Extra employee files, separate from typed HR documents
CREATE TABLE "EmployeeExtraFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeExtraFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeExtraFile_companyId_employeeId_createdAt_idx" ON "EmployeeExtraFile"("companyId", "employeeId", "createdAt");

ALTER TABLE "EmployeeExtraFile" ADD CONSTRAINT "EmployeeExtraFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeExtraFile" ADD CONSTRAINT "EmployeeExtraFile_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
