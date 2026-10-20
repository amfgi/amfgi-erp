import type { Prisma, PrismaClient } from '@prisma/client';

import { P, ROLE_PRESETS } from '@/lib/permissions';

type RoleDb = PrismaClient | Prisma.TransactionClient;

const MANAGER_SALES_KEYS: string[] = [
  P.SALES_QUERY_VIEW,
  P.SALES_QUERY_MANAGE,
  P.SALES_QUOTATION_VIEW,
  P.SALES_QUOTATION_MANAGE,
  P.SALES_PURCHASE_ORDERS_VIEW,
  P.SALES_PURCHASE_ORDERS_MANAGE,
];

function permissionList(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

async function mergeRolePermissions(db: RoleDb, slug: string, keys: string[]): Promise<void> {
  const existing = await db.role.findFirst({ where: { slug } });
  if (!existing) return;
  const current = permissionList(existing.permissions);
  const merged = [...new Set([...current, ...keys])];
  if (merged.length === current.length) return;
  await db.role.update({
    where: { id: existing.id },
    data: { permissions: merged },
  });
}

/** Create the Salesman role and merge sales keys onto Manager. Does not remove existing checks. */
export async function ensureSalesPipelineRoles(db: RoleDb): Promise<void> {
  const preset = [...ROLE_PRESETS.salesman];
  const existing = await db.role.findFirst({ where: { slug: 'salesman' } });
  if (!existing) {
    try {
      await db.role.create({
        data: {
          name: 'Salesman',
          slug: 'salesman',
          permissions: preset,
          isSystem: false,
        },
      });
    } catch {
      const raced = await db.role.findFirst({ where: { slug: 'salesman' } });
      if (raced) await mergeRolePermissions(db, 'salesman', preset);
    }
  } else {
    await mergeRolePermissions(db, 'salesman', preset);
  }

  await mergeRolePermissions(db, 'manager', MANAGER_SALES_KEYS);
}
