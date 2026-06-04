-- Receipt line display fields (UOM, entered qty/cost) live on StockBatch.meta, not notes.
ALTER TABLE "StockBatch" ADD COLUMN IF NOT EXISTS "meta" JSONB;
