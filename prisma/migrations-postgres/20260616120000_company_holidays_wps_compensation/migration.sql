-- Company holidays (payroll), holiday pay-type links, and WPS transfer on compensation.
-- Idempotent: safe when objects were already applied via db push or a partial run.

ALTER TABLE "EmployeeCompensation"
  ADD COLUMN IF NOT EXISTS "wpsTransferAmount" DECIMAL(12,2);

CREATE TABLE IF NOT EXISTS "CompanyHoliday" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "holidayDate" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "employmentTypes" JSONB NOT NULL DEFAULT '[]',
    "workforceRoleTypes" JSONB NOT NULL DEFAULT '[]',
    "visaHoldings" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyHoliday_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyHolidayPayType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyHolidayId" TEXT NOT NULL,
    "payTypeId" TEXT NOT NULL,
    "payWorkedHoursAtOt" BOOLEAN NOT NULL DEFAULT true,
    "holidayOtPercent" INTEGER,

    CONSTRAINT "CompanyHolidayPayType_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyHoliday_companyId_holidayDate_idx"
  ON "CompanyHoliday"("companyId", "holidayDate");

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyHoliday_companyId_id_key"
  ON "CompanyHoliday"("companyId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyHoliday_companyId_holidayDate_key"
  ON "CompanyHoliday"("companyId", "holidayDate");

CREATE INDEX IF NOT EXISTS "CompanyHolidayPayType_companyId_companyHolidayId_idx"
  ON "CompanyHolidayPayType"("companyId", "companyHolidayId");

CREATE INDEX IF NOT EXISTS "CompanyHolidayPayType_companyId_payTypeId_idx"
  ON "CompanyHolidayPayType"("companyId", "payTypeId");

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyHolidayPayType_companyHolidayId_payTypeId_key"
  ON "CompanyHolidayPayType"("companyHolidayId", "payTypeId");

DO $company_holiday_fk$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyHoliday_companyId_fkey') THEN
    ALTER TABLE "CompanyHoliday"
      ADD CONSTRAINT "CompanyHoliday_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyHolidayPayType_companyId_fkey') THEN
    ALTER TABLE "CompanyHolidayPayType"
      ADD CONSTRAINT "CompanyHolidayPayType_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyHolidayPayType_companyId_companyHolidayId_fkey') THEN
    ALTER TABLE "CompanyHolidayPayType"
      ADD CONSTRAINT "CompanyHolidayPayType_companyId_companyHolidayId_fkey"
      FOREIGN KEY ("companyId", "companyHolidayId") REFERENCES "CompanyHoliday"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyHolidayPayType_companyId_payTypeId_fkey') THEN
    ALTER TABLE "CompanyHolidayPayType"
      ADD CONSTRAINT "CompanyHolidayPayType_companyId_payTypeId_fkey"
      FOREIGN KEY ("companyId", "payTypeId") REFERENCES "PayType"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $company_holiday_fk$;
