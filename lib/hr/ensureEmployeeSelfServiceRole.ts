import type { Prisma, PrismaClient } from '@prisma/client';
import { EMPLOYEE_SELF_ROLE_SLUG } from '@/lib/permissions';
import { ensureSystemRole } from '@/lib/auth/systemRoles';

export { EMPLOYEE_SELF_ROLE_SLUG };

export const EMPLOYEE_SELF_ROLE_NAME = 'Employee (self-service)';

type RoleDb = PrismaClient | Prisma.TransactionClient;

/** Global system role for linked employee portal users (`User.linkedEmployeeId`). */
export async function ensureEmployeeSelfServiceRole(db: RoleDb) {
  return ensureSystemRole(db, EMPLOYEE_SELF_ROLE_SLUG);
}
