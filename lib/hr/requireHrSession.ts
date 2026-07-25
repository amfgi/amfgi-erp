import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import type { Permission } from '@/lib/permissions';
import { errorResponse } from '@/lib/utils/apiResponse';
import type { Session } from 'next-auth';

import type { AppSession, AppSessionUser } from '@/lib/hr/requireCompanySession';
import { hasPerm, requirePerm } from '@/lib/hr/requireCompanySession';
import {
  companyIdWhere,
  isCompanyAccessible,
  resolveHrWriteCompanyId,
} from '@/lib/hr/hrCompanyScope';

export type { AppSession, AppSessionUser };
export { hasPerm, requirePerm, companyIdWhere, isCompanyAccessible, resolveHrWriteCompanyId };

export type HrSessionOk = {
  ok: true;
  session: AppSession;
  /** Companies where the user has the required permission (optionally narrowed by filter). */
  companyIds: string[];
  /**
   * Single company when `requireCompanyId` was true or a valid filter was applied.
   * Null when listing across multiple accessible companies.
   */
  companyId: string | null;
};

export type HrSessionErr = {
  ok: false;
  response: ReturnType<typeof errorResponse>;
};

export type RequireHrSessionOptions = {
  /** Permission that scopes which companies are visible/writable. */
  permission: Permission;
  /** Optional company filter from query/body; must be in the accessible set. */
  companyId?: string | null;
  /** When true, a single accessible companyId is required (creates, schedule-by-date). */
  requireCompanyId?: boolean;
};

/**
 * Companies where the user has `permission` via UserCompanyAccess roles.
 * Super-admins get every company id.
 */
export async function getHrAccessibleCompanyIds(
  user: AppSessionUser,
  permission: Permission
): Promise<string[]> {
  if (user.isSuperAdmin) {
    const rows = await prisma.company.findMany({ select: { id: true } });
    return rows.map((r) => r.id);
  }

  const accesses = await prisma.userCompanyAccess.findMany({
    where: { userId: user.id },
    include: { role: { select: { permissions: true } } },
  });

  const byCompany = new Map<string, Set<string>>();
  for (const access of accesses) {
    const perms = (access.role.permissions as string[] | null) ?? [];
    let set = byCompany.get(access.companyId);
    if (!set) {
      set = new Set();
      byCompany.set(access.companyId, set);
    }
    for (const p of perms) set.add(p);
  }

  const result: string[] = [];
  for (const [companyId, perms] of byCompany) {
    if (perms.has(permission)) result.push(companyId);
  }
  return result;
}

/**
 * Auth + HR company scope that does **not** require `activeCompanyId`.
 * Data is limited to companies where the user has `permission`.
 */
export async function requireHrSession(
  options: RequireHrSessionOptions
): Promise<HrSessionOk | HrSessionErr> {
  const session = (await auth()) as Session | null;
  if (!session?.user) {
    return { ok: false, response: errorResponse('Unauthorized', 401) };
  }

  const accessible = await getHrAccessibleCompanyIds(session.user, options.permission);
  if (accessible.length === 0) {
    return { ok: false, response: errorResponse('Forbidden', 403) };
  }

  const filter = options.companyId?.trim() || null;
  if (filter) {
    if (!accessible.includes(filter)) {
      return { ok: false, response: errorResponse('Forbidden', 403) };
    }
    return {
      ok: true,
      session,
      companyIds: [filter],
      companyId: filter,
    };
  }

  if (options.requireCompanyId) {
    return {
      ok: false,
      response: errorResponse('companyId is required', 400),
    };
  }

  return {
    ok: true,
    session,
    companyIds: accessible,
    companyId: accessible.length === 1 ? accessible[0] : null,
  };
}
