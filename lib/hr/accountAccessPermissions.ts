import { P } from '@/lib/permissions';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';

function userPerms(user: AppSessionUser): string[] {
  return user.permissions ?? [];
}

export function canHrAccountAccessView(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  return userPerms(user).includes(P.HR_ACCOUNT_ACCESS_VIEW);
}

export function canHrAccountAccessCreate(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  return userPerms(user).includes(P.HR_ACCOUNT_ACCESS_CREATE);
}

export function canHrAccountAccessEdit(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  return userPerms(user).includes(P.HR_ACCOUNT_ACCESS_EDIT);
}

export function canHrAccountAccessDelete(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  return userPerms(user).includes(P.HR_ACCOUNT_ACCESS_DELETE);
}

type AccountPatchFields = {
  portalEnabled?: boolean;
  provisionNow?: boolean;
  provisionLogin?: boolean;
};

export function employeePatchTouchesAccountFields(data: AccountPatchFields): boolean {
  return (
    data.portalEnabled !== undefined ||
    data.provisionNow === true ||
    data.provisionLogin !== undefined
  );
}

export function assertCanPatchEmployeeAccountFields(
  user: AppSessionUser,
  data: AccountPatchFields
): string | null {
  if (data.portalEnabled !== undefined && !canHrAccountAccessEdit(user)) {
    return 'Forbidden';
  }
  if (
    data.provisionNow === true &&
    data.provisionLogin !== false &&
    !canHrAccountAccessCreate(user)
  ) {
    return 'Forbidden';
  }
  return null;
}
