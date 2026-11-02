import type { Prisma } from '@prisma/client';
import type { Permission } from '@/lib/permissions';
import { ALL_PERMISSIONS } from '@/lib/permissions';

import { asPermissions } from '@/lib/auth/extraPermissions';

type DbClient = Pick<Prisma.TransactionClient, 'user' | 'userCompanyAccess' | 'userCompanyExtraPermission'>;

/** Union permission sets from multiple roles (deduped, stable order). */
export function mergeRolePermissions(permissionSets: Permission[][]): Permission[] {
  const merged = new Set<Permission>();
  for (const set of permissionSets) {
    for (const permission of set) merged.add(permission);
  }
  return [...merged];
}

/** Effective permissions for a user in one company (all assigned roles merged). */
export async function resolvePermissionsForCompany(
  db: DbClient,
  userId: string,
  companyId: string | null
): Promise<Permission[]> {
  if (!companyId) return [];

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  if (user?.isSuperAdmin) return ALL_PERMISSIONS;

  const accesses = await db.userCompanyAccess.findMany({
    where: { userId, companyId },
    include: { role: true },
  });
  if (accesses.length === 0) return [];

  const permissionSets = accesses.map((access) => asPermissions(access.role.permissions));
  const extra = await db.userCompanyExtraPermission.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { permissions: true },
  });
  if (extra) permissionSets.push(asPermissions(extra.permissions));
  return mergeRolePermissions(permissionSets);
}

/** Distinct company ids the user can access (one entry per company, even with multiple roles). */
export function uniqueCompanyIdsFromAccess(access: { companyId: string }[]): string[] {
  return [...new Set(access.map((row) => row.companyId))];
}
