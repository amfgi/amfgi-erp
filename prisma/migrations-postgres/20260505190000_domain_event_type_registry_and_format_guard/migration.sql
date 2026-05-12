CREATE TABLE "DomainEventTypeRegistry" (
  "id" TEXT NOT NULL,
  "module" "DomainModule" NOT NULL,
  "eventType" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DomainEventTypeRegistry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DomainEventTypeRegistry_module_eventType_key"
ON "DomainEventTypeRegistry" ("module", "eventType");

CREATE INDEX "DomainEventTypeRegistry_module_isActive_idx"
ON "DomainEventTypeRegistry" ("module", "isActive");

-- Enforce consistent event naming convention (UPPER_SNAKE_CASE).
ALTER TABLE "DomainEvent"
ADD CONSTRAINT "DomainEvent_eventType_upper_snake_case_chk"
CHECK ("eventType" ~ '^[A-Z][A-Z0-9_]*$');
