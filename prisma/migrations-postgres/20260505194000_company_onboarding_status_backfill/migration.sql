-- Backfill onboarding status from existing operational data.
-- Rule order:
-- 1) OPERATIONAL when company has warehouses and operationalSettings present.
-- 2) WAREHOUSE_READY when company has warehouses but no operationalSettings.
-- 3) PROFILE_READY when no warehouses (preserve non-NEW statuses where possible).

UPDATE "Company" c
SET "onboardingStatus" = 'OPERATIONAL'
WHERE EXISTS (
  SELECT 1
  FROM "Warehouse" w
  WHERE w."companyId" = c."id"
)
AND c."operationalSettings" IS NOT NULL
AND c."onboardingStatus" <> 'OPERATIONAL';

UPDATE "Company" c
SET "onboardingStatus" = 'WAREHOUSE_READY'
WHERE EXISTS (
  SELECT 1
  FROM "Warehouse" w
  WHERE w."companyId" = c."id"
)
AND c."operationalSettings" IS NULL
AND c."onboardingStatus" IN ('NEW', 'PROFILE_READY');

UPDATE "Company" c
SET "onboardingStatus" = 'PROFILE_READY'
WHERE NOT EXISTS (
  SELECT 1
  FROM "Warehouse" w
  WHERE w."companyId" = c."id"
)
AND c."onboardingStatus" = 'NEW';
