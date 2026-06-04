-- Drop unused WorkSchedule.title (schedule identity uses workDate + clientDisplayName).
ALTER TABLE "WorkSchedule" DROP COLUMN IF EXISTS "title";
