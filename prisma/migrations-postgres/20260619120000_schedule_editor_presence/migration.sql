-- Schedule multi-user presence (heartbeat rows per browser tab)
CREATE TABLE "ScheduleEditorPresence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workScheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleEditorPresence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduleEditorPresence_workScheduleId_sessionId_key" ON "ScheduleEditorPresence"("workScheduleId", "sessionId");
CREATE INDEX "ScheduleEditorPresence_companyId_workScheduleId_lastSeenAt_idx" ON "ScheduleEditorPresence"("companyId", "workScheduleId", "lastSeenAt");
CREATE INDEX "ScheduleEditorPresence_userId_idx" ON "ScheduleEditorPresence"("userId");

ALTER TABLE "ScheduleEditorPresence" ADD CONSTRAINT "ScheduleEditorPresence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleEditorPresence" ADD CONSTRAINT "ScheduleEditorPresence_workScheduleId_fkey" FOREIGN KEY ("companyId", "workScheduleId") REFERENCES "WorkSchedule"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleEditorPresence" ADD CONSTRAINT "ScheduleEditorPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
