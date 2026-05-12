INSERT INTO "DomainEventTypeRegistry" ("id", "module", "eventType", "description", "isActive")
VALUES
  (md5(random()::text || clock_timestamp()::text), 'STOCK', 'MATERIAL_CREATED', 'Material master record created', true),
  (md5(random()::text || clock_timestamp()::text), 'STOCK', 'MATERIAL_UPDATED', 'Material master record updated', true),
  (md5(random()::text || clock_timestamp()::text), 'STOCK', 'STOCK_RECEIPT_POSTED', 'Stock receipt transaction posted', true),
  (md5(random()::text || clock_timestamp()::text), 'STOCK', 'STOCK_ISSUE_POSTED', 'Stock issue/dispatch transaction posted', true),
  (md5(random()::text || clock_timestamp()::text), 'STOCK', 'STOCK_TRANSFER_POSTED', 'Stock transfer transaction posted', true),
  (md5(random()::text || clock_timestamp()::text), 'STOCK', 'STOCK_ADJUSTMENT_POSTED', 'Stock adjustment transaction posted', true),
  (md5(random()::text || clock_timestamp()::text), 'STOCK', 'STOCK_COUNT_COMPLETED', 'Stock count session completed', true),
  (md5(random()::text || clock_timestamp()::text), 'STOCK', 'ASSEMBLY_COST_RECALCULATED', 'Assembly material unit cost recalculated', true),

  (md5(random()::text || clock_timestamp()::text), 'JOB', 'JOB_CREATED', 'Job created', true),
  (md5(random()::text || clock_timestamp()::text), 'JOB', 'JOB_UPDATED', 'Job updated', true),
  (md5(random()::text || clock_timestamp()::text), 'JOB', 'JOB_ITEM_ASSIGNED', 'Job item assigned to worker/resource', true),
  (md5(random()::text || clock_timestamp()::text), 'JOB', 'JOB_PROGRESS_RECORDED', 'Job progress entry recorded', true),

  (md5(random()::text || clock_timestamp()::text), 'BUDGET', 'BUDGET_BASELINE_SET', 'Budget baseline established', true),
  (md5(random()::text || clock_timestamp()::text), 'BUDGET', 'BUDGET_REVISED', 'Budget revised', true),
  (md5(random()::text || clock_timestamp()::text), 'BUDGET', 'BUDGET_VARIANCE_RECALCULATED', 'Budget variance snapshot recalculated', true),

  (md5(random()::text || clock_timestamp()::text), 'HR', 'EMPLOYEE_CREATED', 'Employee created', true),
  (md5(random()::text || clock_timestamp()::text), 'HR', 'SCHEDULE_PUBLISHED', 'Work schedule published', true),
  (md5(random()::text || clock_timestamp()::text), 'HR', 'ATTENDANCE_CAPTURED', 'Attendance captured', true),

  (md5(random()::text || clock_timestamp()::text), 'INTEGRATION', 'SYNC_STARTED', 'Integration sync job started', true),
  (md5(random()::text || clock_timestamp()::text), 'INTEGRATION', 'SYNC_SUCCEEDED', 'Integration sync job succeeded', true),
  (md5(random()::text || clock_timestamp()::text), 'INTEGRATION', 'SYNC_FAILED', 'Integration sync job failed', true),

  (md5(random()::text || clock_timestamp()::text), 'SYSTEM', 'WORKFLOW_APPROVAL_REQUESTED', 'Approval workflow requested', true),
  (md5(random()::text || clock_timestamp()::text), 'SYSTEM', 'WORKFLOW_APPROVAL_DECIDED', 'Approval workflow decision recorded', true),
  (md5(random()::text || clock_timestamp()::text), 'SYSTEM', 'COMPANY_ONBOARDING_STATUS_CHANGED', 'Company onboarding status changed', true)
ON CONFLICT ("module", "eventType") DO NOTHING;
