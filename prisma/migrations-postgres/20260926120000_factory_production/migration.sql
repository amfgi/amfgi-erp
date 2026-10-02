CREATE TABLE "FactoryProduction" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "productionDate" DATE NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FactoryProduction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FactoryProductionLine" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "factoryProductionId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "transactionId" TEXT NOT NULL,
  "stockBatchId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FactoryProductionLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FactoryProduction_companyId_id_key" ON "FactoryProduction"("companyId", "id");
CREATE INDEX "FactoryProduction_companyId_productionDate_idx" ON "FactoryProduction"("companyId", "productionDate");

CREATE UNIQUE INDEX "FactoryProductionLine_companyId_id_key" ON "FactoryProductionLine"("companyId", "id");
CREATE UNIQUE INDEX "FactoryProductionLine_transactionId_key" ON "FactoryProductionLine"("transactionId");
CREATE UNIQUE INDEX "FactoryProductionLine_stockBatchId_key" ON "FactoryProductionLine"("stockBatchId");
CREATE INDEX "FactoryProductionLine_companyId_factoryProductionId_idx" ON "FactoryProductionLine"("companyId", "factoryProductionId");
CREATE INDEX "FactoryProductionLine_companyId_materialId_idx" ON "FactoryProductionLine"("companyId", "materialId");

ALTER TABLE "FactoryProduction"
  ADD CONSTRAINT "FactoryProduction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactoryProduction"
  ADD CONSTRAINT "FactoryProduction_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FactoryProduction"
  ADD CONSTRAINT "FactoryProduction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FactoryProductionLine"
  ADD CONSTRAINT "FactoryProductionLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactoryProductionLine"
  ADD CONSTRAINT "FactoryProductionLine_companyId_factoryProductionId_fkey" FOREIGN KEY ("companyId", "factoryProductionId") REFERENCES "FactoryProduction"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactoryProductionLine"
  ADD CONSTRAINT "FactoryProductionLine_companyId_materialId_fkey" FOREIGN KEY ("companyId", "materialId") REFERENCES "Material"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FactoryProductionLine"
  ADD CONSTRAINT "FactoryProductionLine_companyId_transactionId_fkey" FOREIGN KEY ("companyId", "transactionId") REFERENCES "Transaction"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FactoryProductionLine"
  ADD CONSTRAINT "FactoryProductionLine_stockBatchId_fkey" FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
