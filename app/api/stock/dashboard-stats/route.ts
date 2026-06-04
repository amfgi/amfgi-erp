import { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

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

  const [activeMaterials, lowStockRows, openBatches, totalBatches] = await Promise.all([
    canSeeMaterials
      ? prisma.material.count({ where: { companyId, isActive: true } })
      : Promise.resolve(0),
    canSeeMaterials
      ? prisma.$queryRaw<Array<{ count: bigint }>>(
          Prisma.sql`
            SELECT COUNT(*)::bigint AS count
            FROM "Material"
            WHERE "companyId" = ${companyId}
              AND "isActive" = true
              AND "reorderLevel" IS NOT NULL
              AND "currentStock" <= "reorderLevel"
          `,
        )
      : Promise.resolve([{ count: BigInt(0) }]),
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
    openBatches,
    totalBatches,
  });
}
