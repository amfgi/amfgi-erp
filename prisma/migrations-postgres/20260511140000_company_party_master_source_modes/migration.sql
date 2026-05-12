-- Party master data: how customers/suppliers are allowed to enter the system (mirrors job parent source modes).

CREATE TYPE "PartyMasterSourceMode" AS ENUM ('HYBRID', 'EXTERNAL_ONLY', 'INTERNAL_ONLY');

DO $enum$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'JobSourceMode' AND e.enumlabel = 'INTERNAL_ONLY'
  ) THEN
    ALTER TYPE "JobSourceMode" ADD VALUE 'INTERNAL_ONLY';
  END IF;
END $enum$;

ALTER TABLE "Company" ADD COLUMN "customerSourceMode" "PartyMasterSourceMode" NOT NULL DEFAULT 'HYBRID';
ALTER TABLE "Company" ADD COLUMN "supplierSourceMode" "PartyMasterSourceMode" NOT NULL DEFAULT 'HYBRID';
