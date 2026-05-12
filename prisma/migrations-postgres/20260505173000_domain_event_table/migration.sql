CREATE TABLE "DomainEvent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorUserId" TEXT,
  "correlationId" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DomainEvent"
ADD CONSTRAINT "DomainEvent_company_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DomainEvent"
ADD CONSTRAINT "DomainEvent_actorUser_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DomainEvent_company_module_occurred_idx"
ON "DomainEvent" ("companyId", "module", "occurredAt");

CREATE INDEX "DomainEvent_company_entity_occurred_idx"
ON "DomainEvent" ("companyId", "entityType", "entityId", "occurredAt");

CREATE INDEX "DomainEvent_correlation_idx"
ON "DomainEvent" ("correlationId");
