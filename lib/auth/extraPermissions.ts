import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { ALL_PERMISSIONS, type Permission } from '@/lib/permissions';

import type { UserCompanyAccessInput } from './syncUserCompanyAccess';

export type UserExtraPermissionInput = {
  companyId: string;
  permissions: string[];
};

const ALLOWED = new Set<string>(ALL_PERMISSIONS);

export const extraPermissionRowsSchema = z.array(z.object({
  companyId: z.string().min(1),
  permissions: z.array(z.string()).refine(
    (keys) => keys.every((key) => ALLOWED.has(key)),
    { message: 'Invalid permission key' },
  ),
}));

export function permissionList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && ALLOWED.has(item));
}

/** Union extras that name the same company. Drops unknown keys. */
export function mergeExtraPermissionInputs(rows: UserExtraPermissionInput[]): Map<string, string[]> {
  const byCompany = new Map<string, Set<string>>();
  for (const row of rows) {
    const companyId = row.companyId.trim();
    if (!companyId) continue;
    const set = byCompany.get(companyId) ?? new Set<string>();
    for (const key of row.permissions) {
      if (ALLOWED.has(key)) set.add(key);
    }
    byCompany.set(companyId, set);
  }
  return new Map([...byCompany.entries()].map(([companyId, keys]) => [companyId, [...keys]]));
}

/**
 * Replace extras for the companies this user can access.
 * Permissions already granted by the selected roles are not stored.
 * Companies absent from `companyAccess` are left to `syncUserCompanyAccess`.
 */
export async function syncUserExtraPermissions(
  tx: Prisma.TransactionClient,
  userId: string,
  rows: UserExtraPermissionInput[],
  companyAccess: UserCompanyAccessInput[],
): Promise<void> {
  const access = companyAccess.filter((row) => row.companyId && row.roleId);
  const companyIds = [...new Set(access.map((row) => row.companyId))];
  const requested = mergeExtraPermissionInputs(rows);

  const roles = await tx.role.findMany({
    where: { id: { in: [...new Set(access.map((row) => row.roleId))] } },
    select: { id: true, permissions: true },
  });
  const rolePermissions = new Map(roles.map((role) => [role.id, new Set(permissionList(role.permissions))]));

  for (const companyId of companyIds) {
    const granted = new Set<string>();
    for (const row of access) {
      if (row.companyId !== companyId) continue;
      for (const key of rolePermissions.get(row.roleId) ?? []) granted.add(key);
    }
    const extras = (requested.get(companyId) ?? []).filter((key) => !granted.has(key));
    if (extras.length === 0) {
      await tx.userCompanyExtraPermission.deleteMany({ where: { userId, companyId } });
      continue;
    }
    await tx.userCompanyExtraPermission.upsert({
      where: { userId_companyId: { userId, companyId } },
      update: { permissions: extras },
      create: { userId, companyId, permissions: extras },
    });
  }
}

export function asPermissions(value: unknown): Permission[] {
  return permissionList(value) as Permission[];
}

/** Drop extras for companies that no longer have any role assignment. */
export async function deleteOrphanExtraPermissions(
  tx: Prisma.TransactionClient,
  userIds: string[],
): Promise<void> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;

  const [extras, access] = await Promise.all([
    tx.userCompanyExtraPermission.findMany({
      where: { userId: { in: ids } },
      select: { id: true, userId: true, companyId: true },
    }),
    tx.userCompanyAccess.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, companyId: true },
    }),
  ]);
  const accessKeys = new Set(access.map((row) => `${row.userId}:${row.companyId}`));
  const orphanIds = extras
    .filter((row) => !accessKeys.has(`${row.userId}:${row.companyId}`))
    .map((row) => row.id);
  if (orphanIds.length === 0) return;
  await tx.userCompanyExtraPermission.deleteMany({ where: { id: { in: orphanIds } } });
}
