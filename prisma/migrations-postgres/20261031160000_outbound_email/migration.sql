-- Sent sales notification log. Existing rows are not updated.

CREATE TABLE "OutboundEmail" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "toEmail" VARCHAR(320) NOT NULL,
    "toUserId" TEXT,
    "subject" VARCHAR(200) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "error" VARCHAR(300),
    "provider" VARCHAR(40),
    "relatedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboundEmail_companyId_createdAt_idx" ON "OutboundEmail"("companyId", "createdAt");

CREATE INDEX "OutboundEmail_relatedId_idx" ON "OutboundEmail"("relatedId");

CREATE INDEX "OutboundEmail_toUserId_idx" ON "OutboundEmail"("toUserId");

ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
