import { P, type Permission } from '@/lib/permissions';

type PermList = string[];

function has(perms: PermList, key: Permission) {
  return perms.includes(key);
}

export function canViewJobBudget(perms: PermList, isSuperAdmin: boolean) {
  return isSuperAdmin || has(perms, P.STOCK_JOB_BUDGET_VIEW);
}

export function canEditJobBudget(perms: PermList, isSuperAdmin: boolean) {
  return isSuperAdmin || has(perms, P.STOCK_JOB_BUDGET_EDIT);
}

export function canViewFormulaLibrary(perms: PermList, isSuperAdmin: boolean) {
  return isSuperAdmin || has(perms, P.STOCK_FORMULA_VIEW);
}

export function canEditFormulaLibrary(perms: PermList, isSuperAdmin: boolean) {
  return (
    isSuperAdmin ||
    has(perms, P.STOCK_FORMULA_EDIT) ||
    has(perms, P.SETTINGS_MANAGE)
  );
}

export function canViewProductionLog(perms: PermList, isSuperAdmin: boolean) {
  return isSuperAdmin || has(perms, P.STOCK_PRODUCTION_LOG_VIEW);
}

export function canEditProductionLog(perms: PermList, isSuperAdmin: boolean) {
  return (
    isSuperAdmin ||
    has(perms, P.STOCK_PRODUCTION_LOG_EDIT) ||
    has(perms, P.JOB_EDIT)
  );
}

export function canViewProductionLogApi(perms: PermList, isSuperAdmin: boolean) {
  return (
    isSuperAdmin ||
    has(perms, P.STOCK_PRODUCTION_LOG_VIEW) ||
    has(perms, P.STOCK_PRODUCTION_LOG_EDIT) ||
    has(perms, P.JOB_VIEW)
  );
}

export function canViewWarehouseTransfer(perms: PermList, isSuperAdmin: boolean) {
  return isSuperAdmin || has(perms, P.STOCK_WAREHOUSE_TRANSFER_VIEW);
}

export function canTransferWarehouse(perms: PermList, isSuperAdmin: boolean) {
  return (
    isSuperAdmin ||
    has(perms, P.STOCK_WAREHOUSE_TRANSFER_TRANSFER) ||
    has(perms, P.TXN_TRANSFER)
  );
}

export function canViewWarehouseTransferApi(perms: PermList, isSuperAdmin: boolean) {
  return (
    isSuperAdmin ||
    has(perms, P.STOCK_WAREHOUSE_TRANSFER_VIEW) ||
    has(perms, P.STOCK_WAREHOUSE_TRANSFER_TRANSFER) ||
    has(perms, P.TXN_TRANSFER)
  );
}

export function canViewStockCountSession(perms: PermList, isSuperAdmin: boolean) {
  return isSuperAdmin || has(perms, P.STOCK_COUNT_SESSION_VIEW);
}

export function canEditStockCountSession(perms: PermList, isSuperAdmin: boolean) {
  return (
    isSuperAdmin ||
    has(perms, P.STOCK_COUNT_SESSION_EDIT) ||
    has(perms, P.TXN_ADJUST)
  );
}

export function canViewStockCountSessionApi(perms: PermList, isSuperAdmin: boolean) {
  return (
    isSuperAdmin ||
    has(perms, P.STOCK_COUNT_SESSION_VIEW) ||
    has(perms, P.STOCK_COUNT_SESSION_EDIT) ||
    has(perms, P.TXN_ADJUST)
  );
}

/** Job list API (e.g. job budget hub parent contracts). */
export function canViewJobsListApi(perms: PermList, isSuperAdmin: boolean) {
  return (
    isSuperAdmin ||
    has(perms, P.JOB_VIEW) ||
    has(perms, P.STOCK_JOB_BUDGET_VIEW) ||
    has(perms, P.HR_ATTENDANCE_VIEW) ||
    has(perms, P.HR_ATTENDANCE_EDIT)
  );
}

/** Minimal job lookup for HR schedule / attendance pickers. */
export function canViewJobDetailForHrPicker(perms: PermList, isSuperAdmin: boolean) {
  return (
    canViewJobsListApi(perms, isSuperAdmin) ||
    has(perms, P.HR_SCHEDULE_VIEW) ||
    has(perms, P.HR_SCHEDULE_EDIT)
  );
}

/** Job budget line items API. */
export function canViewJobBudgetJobsApi(perms: PermList, isSuperAdmin: boolean) {
  return canViewJobsListApi(perms, isSuperAdmin);
}

export function canEditJobBudgetJobsApi(perms: PermList, isSuperAdmin: boolean) {
  return isSuperAdmin || has(perms, P.JOB_EDIT) || has(perms, P.STOCK_JOB_BUDGET_EDIT);
}

export function canViewFormulaMaterialsApi(perms: PermList, isSuperAdmin: boolean) {
  return (
    isSuperAdmin ||
    has(perms, P.MATERIAL_VIEW) ||
    has(perms, P.STOCK_FORMULA_VIEW) ||
    has(perms, P.STOCK_JOB_BUDGET_VIEW)
  );
}
