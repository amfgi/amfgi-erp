import { canViewWarehouseTransferApi } from '@/lib/permissions/stockModuleAccess';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { WAREHOUSE_TRANSFER_REFERENCE_TYPE } from '@/lib/stock/warehouseTransferConstants';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import type { Prisma } from '@prisma/client';

const warehouseTransferInclude = {
  material: {
    select: { id: true, name: true, unit: true },
  },
  warehouse: {
    select: { id: true, name: true },
  },
} satisfies Prisma.TransactionInclude;

type WarehouseTransferRow = Prisma.TransactionGetPayload<{ include: typeof warehouseTransferInclude }>;

function serializeWarehouseTransfer(transaction: WarehouseTransferRow) {
  const meta = transaction.meta as {
    sourceWarehouseName?: string;
    destinationWarehouseName?: string;
    sourceWarehouseId?: string;
    destinationWarehouseId?: string;
  } | null;

  return {
    id: transaction.id,
    materialId: transaction.materialId,
    materialName: transaction.material.name,
    unit: transaction.material.unit,
    quantity: decimalToNumberOrZero(transaction.quantity),
    sourceWarehouseId: meta?.sourceWarehouseId ?? transaction.warehouseId,
    sourceWarehouseName: meta?.sourceWarehouseName ?? transaction.warehouse?.name ?? null,
    destinationWarehouseId: meta?.destinationWarehouseId ?? null,
    destinationWarehouseName: meta?.destinationWarehouseName ?? transaction.counterpartCompany ?? null,
    notes: transaction.notes,
    date: transaction.date,
    createdAt: transaction.createdAt,
    performedBy: transaction.performedByName ?? transaction.performedBy,
  };
}

function buildWarehouseTransferWhere(companyId: string, search: string): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {
    companyId,
    type: 'TRANSFER_OUT',
    referenceType: WAREHOUSE_TRANSFER_REFERENCE_TYPE,
  };

  if (!search) return where;

  return {
    ...where,
    OR: [
      { notes: { contains: search, mode: 'insensitive' } },
      { material: { name: { contains: search, mode: 'insensitive' } } },
      { warehouse: { name: { contains: search, mode: 'insensitive' } } },
    ],
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canViewWarehouseTransferApi(session.user.permissions, session.user.isSuperAdmin)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');
  const search = searchParams.get('search')?.trim() ?? '';
  const where = buildWarehouseTransferWhere(companyId, search);

  try {
    if (limitParam !== null) {
      const limit = parseListLimit(limitParam);
      const offset = parseListOffset(searchParams.get('offset'));

      const [total, transactions] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
          where,
          include: warehouseTransferInclude,
          orderBy: { date: 'desc' },
          skip: offset,
          take: limit,
        }),
      ]);

      return successResponse({
        items: transactions.map(serializeWarehouseTransfer),
        total,
      });
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: warehouseTransferInclude,
      orderBy: { date: 'desc' },
    });

    return successResponse(transactions.map(serializeWarehouseTransfer));
  } catch {
    return errorResponse('Failed to fetch warehouse transfers', 500);
  }
}
