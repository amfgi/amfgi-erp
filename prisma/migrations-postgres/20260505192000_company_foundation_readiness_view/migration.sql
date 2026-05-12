CREATE OR REPLACE VIEW "CompanyFoundationReadinessView" AS
SELECT
  c."id" AS "companyId",
  c."name" AS "companyName",
  c."slug" AS "companySlug",
  c."isActive",
  c."onboardingStatus",
  c."warehouseMode",
  c."settingsVersion",
  c."foundationChecklist",
  c."operationalSettings",
  EXISTS (
    SELECT 1
    FROM "Warehouse" w
    WHERE w."companyId" = c."id"
  ) AS "hasWarehouse",
  (
    SELECT COUNT(*)
    FROM "Warehouse" w
    WHERE w."companyId" = c."id"
  )::INTEGER AS "warehouseCount",
  EXISTS (
    SELECT 1
    FROM "Material" m
    WHERE m."companyId" = c."id"
  ) AS "hasMaterial",
  (
    SELECT COUNT(*)
    FROM "Material" m
    WHERE m."companyId" = c."id"
  )::INTEGER AS "materialCount",
  CASE
    WHEN c."onboardingStatus" IN ('WAREHOUSE_READY', 'OPERATIONAL')
      AND (
        c."warehouseMode" <> 'REQUIRED'
        OR EXISTS (
          SELECT 1
          FROM "Warehouse" w
          WHERE w."companyId" = c."id"
        )
      )
      AND c."operationalSettings" IS NOT NULL
      AND c."settingsVersion" >= 1
    THEN true
    ELSE false
  END AS "isFoundationReady",
  CASE
    WHEN c."onboardingStatus" NOT IN ('WAREHOUSE_READY', 'OPERATIONAL')
      THEN 'ONBOARDING_INCOMPLETE'
    WHEN c."warehouseMode" = 'REQUIRED'
      AND NOT EXISTS (
        SELECT 1
        FROM "Warehouse" w
        WHERE w."companyId" = c."id"
      )
      THEN 'WAREHOUSE_REQUIRED_MISSING'
    WHEN c."operationalSettings" IS NULL
      THEN 'OPERATIONAL_SETTINGS_MISSING'
    ELSE 'READY'
  END AS "readinessReason"
FROM "Company" c;
