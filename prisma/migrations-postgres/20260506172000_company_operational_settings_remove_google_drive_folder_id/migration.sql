-- Drive root folder configuration is global-only (.env based).
-- Remove deprecated company-scoped key if it exists.
UPDATE "Company" c
SET "operationalSettings" = c."operationalSettings" - 'googleDriveFolderId'
WHERE c."operationalSettings" IS NOT NULL
  AND c."operationalSettings" ? 'googleDriveFolderId';
