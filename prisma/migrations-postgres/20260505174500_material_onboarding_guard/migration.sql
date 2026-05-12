CREATE OR REPLACE FUNCTION enforce_material_onboarding_guard()
RETURNS TRIGGER AS $$
DECLARE
  company_status "CompanyOnboardingStatus";
  company_warehouse_mode "WarehouseMode";
  has_warehouse BOOLEAN;
BEGIN
  SELECT c."onboardingStatus", c."warehouseMode"
  INTO company_status, company_warehouse_mode
  FROM "Company" c
  WHERE c."id" = NEW."companyId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot create material: company % does not exist', NEW."companyId";
  END IF;

  -- Waterfall guard: material creation is only allowed after warehouse step is completed.
  IF company_status NOT IN ('WAREHOUSE_READY', 'OPERATIONAL') THEN
    RAISE EXCEPTION 'Cannot create material: company onboardingStatus is %, expected WAREHOUSE_READY or OPERATIONAL', company_status;
  END IF;

  IF company_warehouse_mode = 'REQUIRED' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "Warehouse" w
      WHERE w."companyId" = NEW."companyId"
    ) INTO has_warehouse;

    IF NOT has_warehouse THEN
      RAISE EXCEPTION 'Cannot create material: at least one warehouse is required for company %', NEW."companyId";
    END IF;

    IF NEW."warehouseId" IS NULL THEN
      RAISE EXCEPTION 'Cannot create material: warehouseId is required when company warehouse mode is REQUIRED';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_material_onboarding_guard ON "Material";

CREATE TRIGGER trg_material_onboarding_guard
BEFORE INSERT ON "Material"
FOR EACH ROW
EXECUTE FUNCTION enforce_material_onboarding_guard();
