CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_company_idempotency_key_uniq"
ON "Transaction"("companyId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;
