import { P } from '@/lib/permissions';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';

function userPerms(user: AppSessionUser): string[] {
  return user.permissions ?? [];
}

function hasGranularHrCompensationPermissions(permissions: string[]): boolean {
  return (
    permissions.includes(P.HR_COMPENSATION_VIEW) ||
    permissions.includes(P.HR_COMPENSATION_CREATE) ||
    permissions.includes(P.HR_COMPENSATION_EDIT) ||
    permissions.includes(P.HR_COMPENSATION_DELETE)
  );
}

/** Legacy `hr.payroll.compensation` grants full compensation CRUD when no granular perms are set. */
export function hasLegacyHrCompensationFullAccess(permissions: string[]): boolean {
  return (
    permissions.includes(P.HR_PAYROLL_COMPENSATION) && !hasGranularHrCompensationPermissions(permissions)
  );
}

function hasAnyCompensationPermission(permissions: string[]): boolean {
  return hasGranularHrCompensationPermissions(permissions) || hasLegacyHrCompensationFullAccess(permissions);
}

export function canHrPayrollSettingsView(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  return userPerms(user).includes(P.HR_PAYROLL_SETTINGS);
}

export function canHrCompensationView(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_COMPENSATION_VIEW) || hasLegacyHrCompensationFullAccess(perms);
}

export function canHrCompensationCreate(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_COMPENSATION_CREATE) || hasLegacyHrCompensationFullAccess(perms);
}

export function canHrCompensationEdit(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_COMPENSATION_EDIT) || hasLegacyHrCompensationFullAccess(perms);
}

export function canHrCompensationDelete(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_COMPENSATION_DELETE) || hasLegacyHrCompensationFullAccess(perms);
}

/** First compensation package on an employee profile. */
export function canHrCompensationAddPackage(user: AppSessionUser): boolean {
  return canHrCompensationCreate(user);
}

/** New timeline entry when compensation already exists. */
export function canHrCompensationRecordChange(user: AppSessionUser): boolean {
  return canHrCompensationEdit(user);
}

/** @deprecated Use canHrCompensationAddPackage / canHrCompensationRecordChange */
export function canHrCompensationRecordPackage(user: AppSessionUser): boolean {
  return canHrCompensationCreate(user) || canHrCompensationEdit(user);
}

export function canHrCompensationPostPackage(
  user: AppSessionUser,
  hasExistingPackages: boolean
): boolean {
  return hasExistingPackages
    ? canHrCompensationRecordChange(user)
    : canHrCompensationAddPackage(user);
}

/** Read pay types / allowance catalogs while editing employee compensation. */
export function canHrCompensationReadPayrollCatalog(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  return hasAnyCompensationPermission(userPerms(user));
}

/** Settings screens and employee compensation forms may read payroll catalogs. */
export function canHrPayrollCatalogRead(user: AppSessionUser): boolean {
  return canHrCompensationReadPayrollCatalog(user) || canHrPayrollSettingsView(user);
}

/** List visa periods when linking a compensation package (not full visa management). */
export function canHrCompensationReadVisaPeriods(user: AppSessionUser): boolean {
  return canHrCompensationAddPackage(user) || canHrCompensationRecordChange(user);
}
