-- Fine deduction months. New table only. Existing fine rows are not changed.
CREATE TABLE "EmployeeFineInstallment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fineId" TEXT NOT NULL,
    "payrollMonth" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeFineInstallment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeFineInstallment_fineId_payrollMonth_key" ON "EmployeeFineInstallment"("fineId", "payrollMonth");
CREATE INDEX "EmployeeFineInstallment_companyId_payrollMonth_idx" ON "EmployeeFineInstallment"("companyId", "payrollMonth");

ALTER TABLE "EmployeeFineInstallment" ADD CONSTRAINT "EmployeeFineInstallment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeFineInstallment" ADD CONSTRAINT "EmployeeFineInstallment_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "EmployeeFine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
