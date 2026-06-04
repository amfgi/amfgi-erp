CREATE TYPE "ProductionStockPostingStatus" AS ENUM ('POSTED', 'REVERSED');

CREATE TABLE "JobItemTrackableMaterialLink" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "jobItemId" TEXT NOT NULL,
  "trackerId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JobItemTrackableMaterialLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionStockPosting" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "progressEntryId" TEXT NOT NULL,
  "jobItemId" TEXT NOT NULL,
  "trackerId" TEXT NOT NULL,
  "trackableMaterialLinkId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "reversalTransactionId" TEXT,
  "stockBatchId" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "status" "ProductionStockPostingStatus" NOT NULL DEFAULT 'POSTED',
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductionStockPosting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobItemTrackableMaterialLink_companyId_jobItemId_trackerId_key"
  ON "JobItemTrackableMaterialLink"("companyId", "jobItemId", "trackerId");

CREATE INDEX "JobItemTrackableMaterialLink_companyId_materialId_idx"
  ON "JobItemTrackableMaterialLink"("companyId", "materialId");

CREATE INDEX "JobItemTrackableMaterialLink_companyId_warehouseId_idx"
  ON "JobItemTrackableMaterialLink"("companyId", "warehouseId");

CREATE UNIQUE INDEX "ProductionStockPosting_companyId_progressEntryId_key"
  ON "ProductionStockPosting"("companyId", "progressEntryId");

CREATE INDEX "ProductionStockPosting_companyId_jobItemId_trackerId_idx"
  ON "ProductionStockPosting"("companyId", "jobItemId", "trackerId");

CREATE INDEX "ProductionStockPosting_companyId_materialId_warehouseId_idx"
  ON "ProductionStockPosting"("companyId", "materialId", "warehouseId");

CREATE INDEX "ProductionStockPosting_companyId_transactionId_idx"
  ON "ProductionStockPosting"("companyId", "transactionId");

CREATE INDEX "ProductionStockPosting_companyId_stockBatchId_idx"
  ON "ProductionStockPosting"("companyId", "stockBatchId");

ALTER TABLE "JobItemTrackableMaterialLink"
  ADD CONSTRAINT "JobItemTrackableMaterialLink_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobItemTrackableMaterialLink"
  ADD CONSTRAINT "JobItemTrackableMaterialLink_companyId_jobItemId_fkey"
  FOREIGN KEY ("companyId", "jobItemId") REFERENCES "JobItem"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobItemTrackableMaterialLink"
  ADD CONSTRAINT "JobItemTrackableMaterialLink_companyId_materialId_fkey"
  FOREIGN KEY ("companyId", "materialId") REFERENCES "Material"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobItemTrackableMaterialLink"
  ADD CONSTRAINT "JobItemTrackableMaterialLink_companyId_warehouseId_fkey"
  FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionStockPosting"
  ADD CONSTRAINT "ProductionStockPosting_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionStockPosting"
  ADD CONSTRAINT "ProductionStockPosting_companyId_jobItemId_fkey"
  FOREIGN KEY ("companyId", "jobItemId") REFERENCES "JobItem"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionStockPosting"
  ADD CONSTRAINT "ProductionStockPosting_trackableMaterialLinkId_fkey"
  FOREIGN KEY ("trackableMaterialLinkId") REFERENCES "JobItemTrackableMaterialLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionStockPosting"
  ADD CONSTRAINT "ProductionStockPosting_companyId_materialId_fkey"
  FOREIGN KEY ("companyId", "materialId") REFERENCES "Material"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionStockPosting"
  ADD CONSTRAINT "ProductionStockPosting_companyId_warehouseId_fkey"
  FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionStockPosting"
  ADD CONSTRAINT "ProductionStockPosting_companyId_transactionId_fkey"
  FOREIGN KEY ("companyId", "transactionId") REFERENCES "Transaction"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionStockPosting"
  ADD CONSTRAINT "ProductionStockPosting_companyId_reversalTransactionId_fkey"
  FOREIGN KEY ("companyId", "reversalTransactionId") REFERENCES "Transaction"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionStockPosting"
  ADD CONSTRAINT "ProductionStockPosting_stockBatchId_fkey"
  FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
