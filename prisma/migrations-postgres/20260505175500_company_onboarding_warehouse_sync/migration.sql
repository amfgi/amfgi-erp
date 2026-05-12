CREATE OR REPLACE FUNCTION sync_company_onboarding_with_warehouses()
RETURNS TRIGGER AS $$
DECLARE
  target_company_id TEXT;
  warehouse_count INTEGER;
BEGIN
  target_company_id := COALESCE(NEW."companyId", OLD."companyId");

  SELECT COUNT(*)
  INTO warehouse_count
  FROM "Warehouse" w
  WHERE w."companyId" = target_company_id;

  -- Preserve OPERATIONAL status; only manage earlier onboarding phases here.
  IF warehouse_count > 0 THEN
    UPDATE "Company" c
    SET "onboardingStatus" = 'WAREHOUSE_READY'
    WHERE c."id" = target_company_id
      AND c."onboardingStatus" IN ('NEW', 'PROFILE_READY');
  ELSE
    UPDATE "Company" c
    SET "onboardingStatus" = 'PROFILE_READY'
    WHERE c."id" = target_company_id
      AND c."onboardingStatus" = 'WAREHOUSE_READY';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_onboarding_warehouse_sync_ins ON "Warehouse";
DROP TRIGGER IF EXISTS trg_company_onboarding_warehouse_sync_del ON "Warehouse";

CREATE TRIGGER trg_company_onboarding_warehouse_sync_ins
AFTER INSERT ON "Warehouse"
FOR EACH ROW
EXECUTE FUNCTION sync_company_onboarding_with_warehouses();

CREATE TRIGGER trg_company_onboarding_warehouse_sync_del
AFTER DELETE ON "Warehouse"
FOR EACH ROW
EXECUTE FUNCTION sync_company_onboarding_with_warehouses();
