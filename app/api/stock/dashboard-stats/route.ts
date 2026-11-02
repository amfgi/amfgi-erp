import { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { LOW_STOCK_PREVIEW_LIMIT, lowStockMaterialsFromSql } from '@/lib/stock/lowStock';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const isSA = session.user.isSuperAdmin;
  const perms = session.user.permissions ?? [];
  const canSeeMaterials = isSA || perms.includes('material.view');
  const canSeeBatches =
    isSA || perms.includes('material.view') || perms.includes('transaction.stock_in');

  if (!canSeeMaterials && !canSeeBatches) return errorResponse('Forbidden', 403);

  const [activeMaterials, lowStockRows, lowStockItemRows, openBatches, totalBatches] = await Promise.all([
    canSeeMaterials
      ? prisma.material.count({ where: { companyId, isActive: true } })
      : Promise.resolve(0),
    canSeeMaterials
      ? prisma.$queryRaw<Array<{ count: bigint }>>(
          Prisma.sql`SELECT COUNT(*)::bigint AS count ${lowStockMaterialsFromSql(companyId)}`,
        )
      : Promise.resolve([{ count: BigInt(0) }]),
    canSeeMaterials
      ? prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            unit: string;
            currentStock: unknown;
            reorderLevel: unknown;
          }>
        >(
          Prisma.sql`
            SELECT id, name, unit, "currentStock", "reorderLevel"
            ${lowStockMaterialsFromSql(companyId)}
            ORDER BY ("reorderLevel" - "currentStock") DESC, name ASC
            LIMIT ${LOW_STOCK_PREVIEW_LIMIT}
          `,
        )
      : Promise.resolve([]),
    canSeeBatches
      ? prisma.stockBatch.count({
          where: { companyId, quantityAvailable: { gt: 0 } },
        })
      : Promise.resolve(0),
    canSeeBatches ? prisma.stockBatch.count({ where: { companyId } }) : Promise.resolve(0),
  ]);

  return successResponse({
    activeMaterials,
    lowStockCount: Number(lowStockRows[0]?.count ?? 0),
    lowStockItems: lowStockItemRows.map((row) => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      currentStock: decimalToNumberOrZero(row.currentStock),
      reorderLevel: decimalToNumberOrZero(row.reorderLevel),
    })),
    openBatches,
    totalBatches,
  });
}
