import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';

const SALES_PERMISSIONS = [
  'sales.query.view',
  'sales.query.manage',
  'sales.quotation.view',
  'sales.quotation.manage',
  'sales.purchaseOrders.view',
  'sales.purchaseOrders.manage',
];

export type SalesUserOption = { id: string; name: string; email: string };

function salesUserSql(companyId: string, userId?: string) {
  const userFilter = userId ? Prisma.sql`AND u.id = ${userId}` : Prisma.empty;
  const limit = userId ? Prisma.sql`LIMIT 1` : Prisma.empty;
  return Prisma.sql`
    SELECT DISTINCT u.id, u.name, u.email
    FROM "User" u
    JOIN "UserCompanyAccess" a ON a."userId" = u.id AND a."companyId" = ${companyId}
    JOIN "Role" r ON r.id = a."roleId"
    WHERE u."isActive" = true
      ${userFilter}
      AND (
        u."isSuperAdmin" = true
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(r.permissions) = 'array' THEN r.permissions ELSE '[]'::jsonb END
          ) AS perm(value)
          WHERE perm.value IN (${Prisma.join(SALES_PERMISSIONS)})
        )
      )
    ORDER BY u.name ASC
    ${limit}
  `;
}

export function listSalesUsers(companyId: string) {
  return prisma.$queryRaw<SalesUserOption[]>(salesUserSql(companyId));
}

export async function findSalesUser(companyId: string, userId: string) {
  const rows = await prisma.$queryRaw<SalesUserOption[]>(salesUserSql(companyId, userId));
  return rows[0] ?? null;
}
