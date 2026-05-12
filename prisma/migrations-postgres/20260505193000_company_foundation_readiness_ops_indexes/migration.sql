-- Company-level filters used by readiness dashboards.
CREATE INDEX IF NOT EXISTS "Company_onboarding_warehouse_active_idx"
ON "Company" ("onboardingStatus", "warehouseMode", "isActive");

-- Speeds up "missing operational settings" checks and segmented reporting.
CREATE INDEX IF NOT EXISTS "Company_operational_settings_null_idx"
ON "Company" ("id")
WHERE "operationalSettings" IS NULL;

-- Useful for sorting/filtering by schema/policy rollout version.
CREATE INDEX IF NOT EXISTS "Company_settings_version_idx"
ON "Company" ("settingsVersion");

-- Optional JSONB index for future key-level settings queries.
CREATE INDEX IF NOT EXISTS "Company_operational_settings_gin_idx"
ON "Company"
USING GIN ("operationalSettings");
