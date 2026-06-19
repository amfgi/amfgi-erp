-- Provisional jobs + job number promotion audit trail.

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "isProvisional" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Job_companyId_isProvisional_idx" ON "Job"("companyId", "isProvisional");

CREATE TABLE IF NOT EXISTS "JobNumberHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "previousJobNumber" TEXT NOT NULL,
    "newJobNumber" TEXT NOT NULL,
    "previousCustomerId" TEXT NOT NULL,
    "newCustomerId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobNumberHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "JobNumberHistory_companyId_jobId_createdAt_idx"
  ON "JobNumberHistory"("companyId", "jobId", "createdAt");
CREATE INDEX IF NOT EXISTS "JobNumberHistory_companyId_createdAt_idx"
  ON "JobNumberHistory"("companyId", "createdAt");

DO $job_number_history_fk$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobNumberHistory_companyId_fkey') THEN
    ALTER TABLE "JobNumberHistory"
      ADD CONSTRAINT "JobNumberHistory_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobNumberHistory_companyId_jobId_fkey') THEN
    ALTER TABLE "JobNumberHistory"
      ADD CONSTRAINT "JobNumberHistory_companyId_jobId_fkey"
      FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $job_number_history_fk$;
