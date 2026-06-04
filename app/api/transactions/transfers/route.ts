import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { WAREHOUSE_TRANSFER_REFERENCE_TYPE } from '@/lib/stock/warehouseTransferConstants';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import type { Prisma } from '@prisma/client';

const transferLedgerInclude = {
  material: {
    select: {
      id: true,
      name: true,
      unit: true,
    },
  },
  warehouse: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.TransactionInclude;

type TransferLedgerRow = Prisma.TransactionGetPayload<{ include: typeof transferLedgerInclude }>;

function buildTransferLedgerWhere(companyId: string, search: string): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {
    companyId,
    type: { in: ['TRANSFER_IN', 'TRANSFER_OUT'] },
    OR: [{ referenceType: null }, { referenceType: { not: WAREHOUSE_TRANSFER_REFERENCE_TYPE } }],
  };

  if (!search) return where;

  return {
    ...where,
    AND: [
      {
        OR: [
          { notes: { contains: search, mode: 'insensitive' } },
          { counterpartCompany: { contains: search, mode: 'insensitive' } },
          { material: { name: { contains: search, mode: 'insensitive' } } },
          { warehouse: { name: { contains: search, mode: 'insensitive' } } },
        ],
      },
    ],
  };
}

async function mapTransferRows(transactions: TransferLedgerRow[]) {
  const counterpartSlugs = [
    ...new Set(transactions.map((transaction) => transaction.counterpartCompany).filter(Boolean)),
  ] as string[];

  const counterpartCompanies = counterpartSlugs.length
    ? await prisma.company.findMany({
        where: { slug: { in: counterpartSlugs } },
        select: { slug: true, name: true },
      })
    : [];

  const counterpartNameBySlug = new Map(counterpartCompanies.map((company) => [company.slug, company.name]));

  return transactions.map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    direction: transaction.type === 'TRANSFER_IN' ? ('IN' as const) : ('OUT' as const),
    materialId: transaction.materialId,
    materialName: transaction.material.name,
    unit: transaction.material.unit,
    quantity: decimalToNumberOrZero(transaction.quantity),
    warehouseId: transaction.warehouse?.id ?? null,
    warehouseName: transaction.warehouse?.name ?? null,
    counterpartCompanySlug: transaction.counterpartCompany,
    counterpartCompanyName: transaction.counterpartCompany
      ? (counterpartNameBySlug.get(transaction.counterpartCompany) ?? transaction.counterpartCompany)
      : null,
    notes: transaction.notes,
    date: transaction.date,
    createdAt: transaction.createdAt,
    performedBy: transaction.performedByName ?? transaction.performedBy,
  }));
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.transfer')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');
  const search = searchParams.get('search')?.trim() ?? '';
  const where = buildTransferLedgerWhere(companyId, search);

  try {
    if (limitParam !== null) {
      const limit = parseListLimit(limitParam);
      const offset = parseListOffset(searchParams.get('offset'));

      const [total, transactions] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
          where,
          include: transferLedgerInclude,
          orderBy: { date: 'desc' },
          skip: offset,
          take: limit,
        }),
      ]);

      return successResponse({
        items: await mapTransferRows(transactions),
        total,
      });
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: transferLedgerInclude,
      orderBy: { date: 'desc' },
    });

    return successResponse(await mapTransferRows(transactions));
  } catch {
    return errorResponse('Failed to fetch transfers', 500);
  }
}
