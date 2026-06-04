import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import type { Prisma } from '@prisma/client';

const stockBatchListInclude = {
  material: {
    select: {
      id: true,
      name: true,
      unit: true,
      stockType: true,
    },
  },
  warehouse: {
    select: {
      id: true,
      name: true,
    },
  },
  supplierRef: {
    select: {
      id: true,
      name: true,
    },
  },
  transactionLinks: {
    include: {
      transaction: {
        select: {
          id: true,
          type: true,
          date: true,
          jobId: true,
        },
      },
    },
    orderBy: {
      transaction: {
        date: 'desc' as const,
      },
    },
  },
} satisfies Prisma.StockBatchInclude;

type StockBatchRow = Prisma.StockBatchGetPayload<{ include: typeof stockBatchListInclude }>;

function serializeStockBatchRow(row: StockBatchRow) {
  const quantityReceived = decimalToNumberOrZero(row.quantityReceived);
  const quantityAvailable = decimalToNumberOrZero(row.quantityAvailable);
  const consumedQty = quantityReceived - quantityAvailable;
  const latestUsage = row.transactionLinks[0]?.transaction;
  const issueLinkCount = row.transactionLinks.filter((link) => link.transaction.type === 'STOCK_OUT').length;

  return {
    id: row.id,
    batchNumber: row.batchNumber,
    receiptNumber: row.receiptNumber,
    materialId: row.materialId,
    materialName: row.material?.name ?? 'Unknown',
    materialUnit: row.material?.unit ?? '-',
    warehouseId: row.warehouse?.id ?? null,
    warehouse: row.warehouse?.name ?? null,
    stockType: row.material?.stockType ?? null,
    supplierId: row.supplierRef?.id ?? null,
    supplierName: row.supplierRef?.name ?? row.supplier ?? null,
    quantityReceived,
    quantityAvailable,
    quantityConsumed: consumedQty,
    unitCost: decimalToNumberOrZero(row.unitCost),
    totalCost: decimalToNumberOrZero(row.totalCost),
    receivedDate: row.receivedDate,
    expiryDate: row.expiryDate,
    notes: row.notes,
    issueLinkCount,
    latestUsageDate: latestUsage?.date ?? null,
  };
}

function buildStockBatchWhere(companyId: string, search: string): Prisma.StockBatchWhereInput {
  const where: Prisma.StockBatchWhereInput = { companyId };
  if (!search) return where;

  return {
    ...where,
    OR: [
      { batchNumber: { contains: search, mode: 'insensitive' } },
      { receiptNumber: { contains: search, mode: 'insensitive' } },
      { supplier: { contains: search, mode: 'insensitive' } },
      { material: { name: { contains: search, mode: 'insensitive' } } },
      { supplierRef: { name: { contains: search, mode: 'insensitive' } } },
    ],
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const canView =
    session.user.isSuperAdmin ||
    session.user.permissions.includes('material.view') ||
    session.user.permissions.includes('transaction.stock_in') ||
    session.user.permissions.includes('transaction.stock_out');

  if (!canView) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');
  const search = searchParams.get('search')?.trim() ?? '';
  const where = buildStockBatchWhere(companyId, search);

  try {
    if (limitParam !== null) {
      const limit = parseListLimit(limitParam);
      const offset = parseListOffset(searchParams.get('offset'));

      const [total, rows] = await Promise.all([
        prisma.stockBatch.count({ where }),
        prisma.stockBatch.findMany({
          where,
          include: stockBatchListInclude,
          orderBy: [{ receivedDate: 'desc' }, { createdAt: 'desc' }],
          skip: offset,
          take: limit,
        }),
      ]);

      return successResponse({
        items: rows.map(serializeStockBatchRow),
        total,
      });
    }

    const rows = await prisma.stockBatch.findMany({
      where,
      include: stockBatchListInclude,
      orderBy: [{ receivedDate: 'desc' }, { createdAt: 'desc' }],
    });

    return successResponse(rows.map(serializeStockBatchRow));
  } catch (error: unknown) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to load stock batches', 500);
  }
}
