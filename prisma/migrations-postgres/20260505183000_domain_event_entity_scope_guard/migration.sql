CREATE OR REPLACE FUNCTION validate_domain_event_entity_scope()
RETURNS TRIGGER AS $$
DECLARE
  normalized_entity_type TEXT;
  entity_exists BOOLEAN;
BEGIN
  normalized_entity_type := LOWER(TRIM(NEW."entityType"));

  IF normalized_entity_type = '' THEN
    RAISE EXCEPTION 'DomainEvent entityType cannot be empty';
  END IF;

  IF NEW."entityId" IS NULL OR TRIM(NEW."entityId") = '' THEN
    RAISE EXCEPTION 'DomainEvent entityId cannot be empty';
  END IF;

  -- Practical polymorphic guard:
  -- Validate known entity types against same-company records.
  -- Unknown/new entity types are allowed for forward compatibility.
  IF normalized_entity_type = 'transaction' THEN
    SELECT EXISTS (
      SELECT 1 FROM "Transaction" t
      WHERE t."companyId" = NEW."companyId" AND t."id" = NEW."entityId"
    ) INTO entity_exists;
  ELSIF normalized_entity_type = 'stockbatch' THEN
    SELECT EXISTS (
      SELECT 1 FROM "StockBatch" sb
      WHERE sb."companyId" = NEW."companyId" AND sb."id" = NEW."entityId"
    ) INTO entity_exists;
  ELSIF normalized_entity_type = 'businessdocument' THEN
    SELECT EXISTS (
      SELECT 1 FROM "BusinessDocument" bd
      WHERE bd."companyId" = NEW."companyId" AND bd."id" = NEW."entityId"
    ) INTO entity_exists;
  ELSIF normalized_entity_type = 'material' THEN
    SELECT EXISTS (
      SELECT 1 FROM "Material" m
      WHERE m."companyId" = NEW."companyId" AND m."id" = NEW."entityId"
    ) INTO entity_exists;
  ELSIF normalized_entity_type = 'warehouse' THEN
    SELECT EXISTS (
      SELECT 1 FROM "Warehouse" w
      WHERE w."companyId" = NEW."companyId" AND w."id" = NEW."entityId"
    ) INTO entity_exists;
  ELSIF normalized_entity_type = 'job' THEN
    SELECT EXISTS (
      SELECT 1 FROM "Job" j
      WHERE j."companyId" = NEW."companyId" AND j."id" = NEW."entityId"
    ) INTO entity_exists;
  ELSIF normalized_entity_type = 'supplier' THEN
    SELECT EXISTS (
      SELECT 1 FROM "Supplier" s
      WHERE s."companyId" = NEW."companyId" AND s."id" = NEW."entityId"
    ) INTO entity_exists;
  ELSIF normalized_entity_type = 'customer' THEN
    SELECT EXISTS (
      SELECT 1 FROM "Customer" c
      WHERE c."companyId" = NEW."companyId" AND c."id" = NEW."entityId"
    ) INTO entity_exists;
  ELSIF normalized_entity_type = 'employee' THEN
    SELECT EXISTS (
      SELECT 1 FROM "Employee" e
      WHERE e."companyId" = NEW."companyId" AND e."id" = NEW."entityId"
    ) INTO entity_exists;
  ELSIF normalized_entity_type = 'workflowapproval' THEN
    SELECT EXISTS (
      SELECT 1 FROM "WorkflowApproval" wa
      WHERE wa."companyId" = NEW."companyId" AND wa."id" = NEW."entityId"
    ) INTO entity_exists;
  ELSE
    RETURN NEW;
  END IF;

  IF NOT entity_exists THEN
    RAISE EXCEPTION 'DomainEvent entity reference not found in same company: type=%, companyId=%, entityId=%',
      NEW."entityType", NEW."companyId", NEW."entityId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_domain_event_entity_scope_guard ON "DomainEvent";

CREATE TRIGGER trg_domain_event_entity_scope_guard
BEFORE INSERT OR UPDATE ON "DomainEvent"
FOR EACH ROW
EXECUTE FUNCTION validate_domain_event_entity_scope();
