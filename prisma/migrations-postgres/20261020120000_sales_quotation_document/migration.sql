-- Quotation pad document. Existing rows stay unchanged; the column starts empty.

ALTER TABLE "SalesQuery" ADD COLUMN "quotationDocument" JSONB;
