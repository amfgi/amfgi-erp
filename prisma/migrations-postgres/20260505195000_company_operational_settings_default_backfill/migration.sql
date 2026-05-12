-- Initialize minimal operational settings defaults for existing tenants.
-- This keeps policy values explicit and avoids hardcoded behavior in code paths.
UPDATE "Company" c
SET "operationalSettings" = jsonb_build_object(
  'inventoryValuationMethod', 'FIFO',
  'currencyCode', 'AED',
  'allowNegativeStock', false,
  'stockDispatchPolicy', 'BLOCK_IF_INSUFFICIENT',
  'stockReservationMode', 'SOFT',
  'autoCreateStockBatches', true,
  'updatedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
)
WHERE c."operationalSettings" IS NULL;

-- Advance onboarding status to OPERATIONAL when warehouse and settings are both ready.
UPDATE "Company" c
SET "onboardingStatus" = 'OPERATIONAL'
WHERE c."onboardingStatus" = 'WAREHOUSE_READY'
  AND c."operationalSettings" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "Warehouse" w
    WHERE w."companyId" = c."id"
  );
