CREATE TYPE "DomainModule" AS ENUM (
  'STOCK',
  'JOB',
  'BUDGET',
  'HR',
  'PROCUREMENT',
  'PRODUCTION',
  'FINANCE',
  'INTEGRATION',
  'SYSTEM',
  'OTHER'
);

ALTER TABLE "DomainEvent"
ALTER COLUMN "module" TYPE "DomainModule"
USING (
  CASE LOWER(TRIM("module"))
    WHEN 'stock' THEN 'STOCK'::"DomainModule"
    WHEN 'job' THEN 'JOB'::"DomainModule"
    WHEN 'budget' THEN 'BUDGET'::"DomainModule"
    WHEN 'hr' THEN 'HR'::"DomainModule"
    WHEN 'procurement' THEN 'PROCUREMENT'::"DomainModule"
    WHEN 'production' THEN 'PRODUCTION'::"DomainModule"
    WHEN 'finance' THEN 'FINANCE'::"DomainModule"
    WHEN 'integration' THEN 'INTEGRATION'::"DomainModule"
    WHEN 'system' THEN 'SYSTEM'::"DomainModule"
    ELSE 'OTHER'::"DomainModule"
  END
);
