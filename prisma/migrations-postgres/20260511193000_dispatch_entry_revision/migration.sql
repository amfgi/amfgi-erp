-- Dispatch worksheet / delivery-note revision audit (per job + calendar day)

CREATE TABLE "DispatchEntryRevision" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "postingDateKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'WORKSHEET',
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "linesBefore" JSONB,
    "linesAfter" JSONB NOT NULL,
    "changeSummary" JSONB,
    "notesSnippet" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchEntryRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DispatchEntryRevision_companyId_jobId_postingDateKey_idx"
  ON "DispatchEntryRevision"("companyId", "jobId", "postingDateKey");

CREATE INDEX "DispatchEntryRevision_companyId_createdAt_idx"
  ON "DispatchEntryRevision"("companyId", "createdAt");

ALTER TABLE "DispatchEntryRevision"
  ADD CONSTRAINT "DispatchEntryRevision_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DispatchEntryRevision"
  ADD CONSTRAINT "DispatchEntryRevision_jobId_fkey"
  FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DispatchEntryRevision"
  ADD CONSTRAINT "DispatchEntryRevision_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
