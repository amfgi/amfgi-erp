ALTER TABLE "Company"
DROP CONSTRAINT IF EXISTS "Company_stockFallbackWarehouseId_fkey";

ALTER TABLE "Company"
ADD CONSTRAINT "Company_companyId_stockFallbackWarehouseId_fkey"
FOREIGN KEY ("id", "stockFallbackWarehouseId")
REFERENCES "Warehouse"("companyId", "id")
ON DELETE SET NULL
ON UPDATE CASCADE;
