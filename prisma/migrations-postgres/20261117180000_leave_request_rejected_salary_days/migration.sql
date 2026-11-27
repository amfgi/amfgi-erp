-- Days of salary to cut when sick leave is rejected. Existing rows stay null.
ALTER TABLE "LeaveRequest" ADD COLUMN "rejectedSalaryDeductionDays" INTEGER;
