-- Allow budget lines without a formula library (manual material + labor budget).
ALTER TABLE "JobItem" ALTER COLUMN "formulaLibraryId" DROP NOT NULL;
