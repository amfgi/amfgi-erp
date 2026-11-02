-- Extra permissions for one user in one company. Existing rows are not updated.

CREATE TABLE "UserCompanyExtraPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCompanyExtraPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserCompanyExtraPermission_userId_companyId_key" ON "UserCompanyExtraPermission"("userId", "companyId");

CREATE INDEX "UserCompanyExtraPermission_companyId_idx" ON "UserCompanyExtraPermission"("companyId");

ALTER TABLE "UserCompanyExtraPermission" ADD CONSTRAINT "UserCompanyExtraPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserCompanyExtraPermission" ADD CONSTRAINT "UserCompanyExtraPermission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
