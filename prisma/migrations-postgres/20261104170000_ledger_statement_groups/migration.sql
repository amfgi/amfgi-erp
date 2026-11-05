-- Statement groups become company rows so Settings can create and edit them.
-- Existing type rows keep their group by copying the enum into the new table.

CREATE TYPE "FinancialStatementSection" AS ENUM ('BALANCE_SHEET', 'PROFIT_AND_LOSS');

CREATE TABLE "LedgerStatementGroup" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalSide" "AccountNormalSide" NOT NULL,
  "reportsOn" "FinancialStatementSection" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerStatementGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LedgerStatementGroup_companyId_name_key" ON "LedgerStatementGroup"("companyId", "name");
CREATE INDEX "LedgerStatementGroup_companyId_sortOrder_idx" ON "LedgerStatementGroup"("companyId", "sortOrder");

ALTER TABLE "LedgerStatementGroup"
  ADD CONSTRAINT "LedgerStatementGroup_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "LedgerStatementGroup" ("id", "companyId", "name", "normalSide", "reportsOn", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", v.name, v.normal_side::"AccountNormalSide", v.reports_on::"FinancialStatementSection", v.sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
CROSS JOIN (VALUES
  ('Asset', 'DEBIT', 'BALANCE_SHEET', 10),
  ('Liability', 'CREDIT', 'BALANCE_SHEET', 20),
  ('Equity', 'CREDIT', 'BALANCE_SHEET', 30),
  ('Income', 'CREDIT', 'PROFIT_AND_LOSS', 40),
  ('Cost of Goods Sold', 'DEBIT', 'PROFIT_AND_LOSS', 50),
  ('Expense', 'DEBIT', 'PROFIT_AND_LOSS', 60)
) AS v(name, normal_side, reports_on, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "LedgerStatementGroup" existing WHERE existing."companyId" = c."id"
);

ALTER TABLE "LedgerAccountType" ADD COLUMN "statementGroupId" TEXT;

UPDATE "LedgerAccountType" AS t
SET "statementGroupId" = g."id"
FROM "LedgerStatementGroup" AS g
WHERE g."companyId" = t."companyId"
  AND g."name" = CASE t."statementGroup"::text
    WHEN 'ASSET' THEN 'Asset'
    WHEN 'LIABILITY' THEN 'Liability'
    WHEN 'EQUITY' THEN 'Equity'
    WHEN 'INCOME' THEN 'Income'
    WHEN 'COST_OF_GOODS_SOLD' THEN 'Cost of Goods Sold'
    WHEN 'EXPENSE' THEN 'Expense'
  END;

ALTER TABLE "LedgerAccountType" ALTER COLUMN "statementGroupId" SET NOT NULL;

ALTER TABLE "LedgerAccountType"
  ADD CONSTRAINT "LedgerAccountType_statementGroupId_fkey"
  FOREIGN KEY ("statementGroupId") REFERENCES "LedgerStatementGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "LedgerAccountType_statementGroupId_idx" ON "LedgerAccountType"("statementGroupId");

ALTER TABLE "LedgerAccountType" DROP COLUMN "statementGroup";

DROP TYPE "AccountStatementGroup";
