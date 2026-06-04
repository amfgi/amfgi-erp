-- Guest drivers (rental / hire) on schedule day sheet; employee link optional.
ALTER TABLE "DriverRunLog" ADD COLUMN IF NOT EXISTS "guestDriverName" TEXT;

ALTER TABLE "DriverRunLog" ALTER COLUMN "driverEmployeeId" DROP NOT NULL;
