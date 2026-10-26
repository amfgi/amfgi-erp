-- Quotation assignee and a work log. Existing sales rows are not updated.

ALTER TABLE "SalesQuery" ADD COLUMN "assignedToId" TEXT;

CREATE INDEX "SalesQuery_assignedToId_idx" ON "SalesQuery"("assignedToId");

ALTER TABLE "SalesQuery" ADD CONSTRAINT "SalesQuery_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SalesWorkLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesQueryId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "detail" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesWorkLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesWorkLog_companyId_salesQueryId_createdAt_idx" ON "SalesWorkLog"("companyId", "salesQueryId", "createdAt");

ALTER TABLE "SalesWorkLog" ADD CONSTRAINT "SalesWorkLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesWorkLog" ADD CONSTRAINT "SalesWorkLog_companyId_salesQueryId_fkey" FOREIGN KEY ("companyId", "salesQueryId") REFERENCES "SalesQuery"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesWorkLog" ADD CONSTRAINT "SalesWorkLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
