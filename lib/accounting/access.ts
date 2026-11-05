import { P } from '@/lib/permissions';

export function canManageAccounting(user: {
  isSuperAdmin?: boolean;
  permissions?: string[] | null;
}): boolean {
  if (user.isSuperAdmin) return true;
  const permissions = user.permissions ?? [];
  return permissions.includes(P.ACCOUNTING_MANAGE) || permissions.includes(P.SETTINGS_MANAGE);
}
