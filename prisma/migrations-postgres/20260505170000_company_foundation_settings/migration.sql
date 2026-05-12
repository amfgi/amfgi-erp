CREATE TYPE "CompanyOnboardingStatus" AS ENUM ('NEW', 'PROFILE_READY', 'WAREHOUSE_READY', 'OPERATIONAL');

ALTER TABLE "Company"
ADD COLUMN "onboardingStatus" "CompanyOnboardingStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN "foundationChecklist" JSONB,
ADD COLUMN "operationalSettings" JSONB,
ADD COLUMN "settingsVersion" INTEGER NOT NULL DEFAULT 1;
