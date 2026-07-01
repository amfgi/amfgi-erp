import { P } from '@/lib/permissions';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';

function userPerms(user: AppSessionUser): string[] {
  return user.permissions ?? [];
}

export function canHrVisaView(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  return userPerms(user).includes(P.HR_VISA_VIEW);
}

export function canHrVisaCreate(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  return userPerms(user).includes(P.HR_VISA_CREATE);
}

export function canHrVisaEdit(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  return userPerms(user).includes(P.HR_VISA_EDIT);
}

export function canHrVisaDelete(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  return userPerms(user).includes(P.HR_VISA_DELETE);
}

export function canHrVisaMutate(user: AppSessionUser): boolean {
  return canHrVisaCreate(user) || canHrVisaEdit(user);
}
