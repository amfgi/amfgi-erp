# Database Scalability Blueprint (AMFGI)

This blueprint defines additive, backward-compatible database changes that keep AMFGI focused on stock/consumption/job-budget today while enabling future expansion into procurement, production, payroll, and finance-adjacent workflows.

## Goals

- Keep current stock workflows stable.
- Enforce company-scoped governance and readiness.
- Remove hardcoded policy drift by introducing company-level operational settings.
- Make transaction and document models extensible for future modules.

## Scope

- Prisma schema additions only (no API/UI behavior change in this step).
- Postgres-safe migration order.
- Additive changes only; no destructive renames/deletes.

## Phase A: Company foundation + policy spine

### Add enum

```prisma
enum CompanyOnboardingStatus {
  NEW
  PROFILE_READY
  WAREHOUSE_READY
  OPERATIONAL
}
```

### Add fields to `Company`

```prisma
onboardingStatus    CompanyOnboardingStatus @default(NEW)
foundationChecklist Json?
operationalSettings Json?
settingsVersion     Int @default(1)
```

## Phase B: Transaction extensibility

### Add fields to `Transaction`

```prisma
sourceModule       String   @default("stock")
referenceType      String?
referenceId        String?
idempotencyKey     String?
postingGroupId     String?
meta               Json?
businessDocumentId String?
```

### Add indexes

```prisma
@@index([companyId, sourceModule, date])
@@index([companyId, referenceType, referenceId])
@@index([companyId, postingGroupId])
@@index([companyId, businessDocumentId])
```

### Add partial unique index via SQL migration

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_company_idempotency_key_uniq"
ON "Transaction"("companyId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;
```

## Phase C: Cross-domain event stream

### Add table

```prisma
model DomainEvent {
  id            String   @id @default(cuid())
  companyId     String
  module        String
  eventType     String
  entityType    String
  entityId      String
  occurredAt    DateTime @default(now())
  actorUserId   String?
  correlationId String?
  payload       Json?
  createdAt     DateTime @default(now())

  company       Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  actorUser     User?    @relation("DomainEventActorUser", fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([companyId, module, occurredAt])
  @@index([companyId, entityType, entityId, occurredAt])
  @@index([correlationId])
}
```

## Phase D: Generic business document header

### Add enum

```prisma
enum BusinessDocumentStatus {
  DRAFT
  SUBMITTED
  APPROVED
  POSTED
  VOID
}
```

### Add table

```prisma
model BusinessDocument {
  id            String                 @id @default(cuid())
  companyId     String
  docType       String
  docNumber     String
  docDate       DateTime
  status        BusinessDocumentStatus @default(DRAFT)
  sourceModule  String
  partyType     String?
  partyId       String?
  currencyCode  String?
  fxRate        Decimal?               @db.Decimal(18, 6)
  totals        Json?
  meta          Json?
  createdById   String?
  approvedById  String?
  approvedAt    DateTime?
  createdAt     DateTime               @default(now())
  updatedAt     DateTime               @updatedAt

  company       Company                @relation(fields: [companyId], references: [id], onDelete: Cascade)
  createdBy     User?                  @relation("BusinessDocumentCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  approvedBy    User?                  @relation("BusinessDocumentApprovedBy", fields: [approvedById], references: [id], onDelete: SetNull)

  transactions  Transaction[]
  stockBatches  StockBatch[]

  @@unique([companyId, docType, docNumber])
  @@index([companyId, docType, status, docDate])
  @@index([companyId, sourceModule, docDate])
  @@index([companyId, partyType, partyId])
}
```

## Phase E: Shared workflow approval model

### Add enum

```prisma
enum WorkflowApprovalStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}
```

### Add table

```prisma
model WorkflowApproval {
  id            String                 @id @default(cuid())
  companyId     String
  entityType    String
  entityId      String
  workflowType  String
  status        WorkflowApprovalStatus @default(PENDING)
  requestedById String?
  requestedAt   DateTime               @default(now())
  decidedById   String?
  decidedAt     DateTime?
  decisionNote  String?                @db.Text
  payload       Json?

  company       Company                @relation(fields: [companyId], references: [id], onDelete: Cascade)
  requestedBy   User?                  @relation("WorkflowApprovalRequestedBy", fields: [requestedById], references: [id], onDelete: SetNull)
  decidedBy     User?                  @relation("WorkflowApprovalDecidedBy", fields: [decidedById], references: [id], onDelete: SetNull)

  @@unique([companyId, workflowType, entityType, entityId])
  @@index([companyId, status, requestedAt])
  @@index([companyId, workflowType, status])
}
```

## Required reverse relations

### `Company`

```prisma
domainEvents       DomainEvent[]
businessDocuments  BusinessDocument[]
workflowApprovals  WorkflowApproval[]
```

### `User`

```prisma
domainEvents                DomainEvent[]      @relation("DomainEventActorUser")
createdBusinessDocuments    BusinessDocument[] @relation("BusinessDocumentCreatedBy")
approvedBusinessDocuments   BusinessDocument[] @relation("BusinessDocumentApprovedBy")
requestedWorkflowApprovals  WorkflowApproval[] @relation("WorkflowApprovalRequestedBy")
decidedWorkflowApprovals    WorkflowApproval[] @relation("WorkflowApprovalDecidedBy")
```

## Migration order (recommended)

1. Company foundation fields and enum.
2. Transaction extensibility fields and indexes.
3. DomainEvent table.
4. BusinessDocument table + optional links from `Transaction` and `StockBatch`.
5. WorkflowApproval table.
6. SQL-only partial unique index for idempotency key.

## Rollout and safety notes

- All changes are additive and nullable/defaulted.
- No immediate API behavior changes required.
- Enable feature flags for new capabilities before enforcing hard gates.
- Prefer forward-fix over rollback once write paths adopt new fields.

