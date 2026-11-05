-- Manual books: account types, chart of accounts, journals.
-- Inserts defaults only for companies that do not already have account types.

CREATE TYPE "AccountStatementGroup" AS ENUM (
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'COST_OF_GOODS_SOLD',
  'EXPENSE'
);

CREATE TYPE "AccountNormalSide" AS ENUM ('DEBIT', 'CREDIT');

CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'SAVED');

CREATE TABLE "LedgerAccountType" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "statementGroup" "AccountStatementGroup" NOT NULL,
  "increaseSide" "AccountNormalSide" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerAccountType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LedgerAccount" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "accountTypeId" TEXT NOT NULL,
  "parentId" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "note" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JournalCounter" (
  "companyId" TEXT NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "JournalCounter_pkey" PRIMARY KEY ("companyId")
);

CREATE TABLE "JournalEntry" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "entryNumber" INTEGER NOT NULL,
  "entryDate" DATE NOT NULL,
  "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
  "idempotencyKey" TEXT,
  "reversedFromId" TEXT,
  "reversedById" TEXT,
  "createdById" TEXT,
  "savedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JournalLine" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "debit" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "memo" TEXT,
  "partyName" TEXT,
  "vatItem" TEXT,
  "billable" BOOLEAN NOT NULL DEFAULT false,
  "jobLabel" TEXT,
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JournalTemplate" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "lines" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JournalAttachment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LedgerAccountType_companyId_name_key" ON "LedgerAccountType"("companyId", "name");
CREATE INDEX "LedgerAccountType_companyId_sortOrder_idx" ON "LedgerAccountType"("companyId", "sortOrder");

CREATE UNIQUE INDEX "LedgerAccount_company_root_name_key" ON "LedgerAccount"("companyId", "name") WHERE "parentId" IS NULL;
CREATE UNIQUE INDEX "LedgerAccount_company_child_name_key" ON "LedgerAccount"("companyId", "parentId", "name") WHERE "parentId" IS NOT NULL;
CREATE UNIQUE INDEX "LedgerAccount_company_code_key" ON "LedgerAccount"("companyId", "code") WHERE "code" IS NOT NULL AND btrim("code") <> '';
CREATE INDEX "LedgerAccount_companyId_accountTypeId_idx" ON "LedgerAccount"("companyId", "accountTypeId");
CREATE INDEX "LedgerAccount_companyId_parentId_idx" ON "LedgerAccount"("companyId", "parentId");
CREATE INDEX "LedgerAccount_companyId_isActive_idx" ON "LedgerAccount"("companyId", "isActive");

CREATE UNIQUE INDEX "JournalEntry_companyId_entryNumber_key" ON "JournalEntry"("companyId", "entryNumber");
CREATE UNIQUE INDEX "JournalEntry_companyId_idempotencyKey_key" ON "JournalEntry"("companyId", "idempotencyKey");
CREATE INDEX "JournalEntry_companyId_status_entryDate_idx" ON "JournalEntry"("companyId", "status", "entryDate");
CREATE INDEX "JournalEntry_reversedFromId_idx" ON "JournalEntry"("reversedFromId");

CREATE INDEX "JournalLine_companyId_accountId_idx" ON "JournalLine"("companyId", "accountId");
CREATE INDEX "JournalLine_journalEntryId_sortOrder_idx" ON "JournalLine"("journalEntryId", "sortOrder");
CREATE INDEX "JournalTemplate_companyId_createdAt_idx" ON "JournalTemplate"("companyId", "createdAt");
CREATE INDEX "JournalAttachment_journalEntryId_idx" ON "JournalAttachment"("journalEntryId");

ALTER TABLE "LedgerAccountType" ADD CONSTRAINT "LedgerAccountType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_accountTypeId_fkey" FOREIGN KEY ("accountTypeId") REFERENCES "LedgerAccountType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalCounter" ADD CONSTRAINT "JournalCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversedFromId_fkey" FOREIGN KEY ("reversedFromId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalTemplate" ADD CONSTRAINT "JournalTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalAttachment" ADD CONSTRAINT "JournalAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalAttachment" ADD CONSTRAINT "JournalAttachment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "LedgerAccountType" ("id", "companyId", "name", "statementGroup", "increaseSide", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", v.name, v.statement_group::"AccountStatementGroup", v.increase_side::"AccountNormalSide", true, v.sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
CROSS JOIN (VALUES
  ('Bank', 'ASSET', 'DEBIT', 10),
  ('Accounts Receivable', 'ASSET', 'DEBIT', 20),
  ('Other Current Asset', 'ASSET', 'DEBIT', 30),
  ('Fixed Asset', 'ASSET', 'DEBIT', 40),
  ('Other Asset', 'ASSET', 'DEBIT', 50),
  ('Accounts Payable', 'LIABILITY', 'CREDIT', 60),
  ('Credit Card', 'LIABILITY', 'CREDIT', 70),
  ('Other Current Liability', 'LIABILITY', 'CREDIT', 80),
  ('Long Term Liability', 'LIABILITY', 'CREDIT', 90),
  ('Loan', 'LIABILITY', 'CREDIT', 100),
  ('Equity', 'EQUITY', 'CREDIT', 110),
  ('Income', 'INCOME', 'CREDIT', 120),
  ('Other Income', 'INCOME', 'CREDIT', 130),
  ('Cost of Goods Sold', 'COST_OF_GOODS_SOLD', 'DEBIT', 140),
  ('Expense', 'EXPENSE', 'DEBIT', 150),
  ('Other Expense', 'EXPENSE', 'DEBIT', 160)
) AS v(name, statement_group, increase_side, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "LedgerAccountType" existing WHERE existing."companyId" = c."id"
);

INSERT INTO "LedgerAccount" ("id", "companyId", "accountTypeId", "parentId", "name", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."companyId", t."id", NULL, v.account_name, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "LedgerAccountType" t
JOIN (VALUES
  ('Bank', 'Bank'),
  ('Accounts Receivable', 'Accounts Receivable'),
  ('Accounts Payable', 'Accounts Payable'),
  ('Other Current Liability', 'VAT'),
  ('Equity', 'Owner''s capital'),
  ('Income', 'Sales'),
  ('Cost of Goods Sold', 'Cost of Goods Sold'),
  ('Expense', 'Salaries')
) AS v(type_name, account_name) ON t."name" = v.type_name
WHERE NOT EXISTS (
  SELECT 1 FROM "LedgerAccount" existing WHERE existing."companyId" = t."companyId"
);
