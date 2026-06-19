-- Job project type and quantity/area scope on work-process section fields
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "projectType" VARCHAR(120);
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "projectQtyArea" VARCHAR(120);
