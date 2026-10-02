import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { postFactoryProduction } from '@/lib/stock/factoryProductionPosting';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { z } from 'zod';

function canPostFactoryProduction(permissions: string[], isSuperAdmin: boolean) {
  return isSuperAdmin || permissions.includes('transaction.stock_in');
}

const LineSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().positive(),
});

const BodySchema = z.object({
  productionDate: z.string().min(1),
  warehouseId: z.string().min(1),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(LineSchema).min(1).max(50),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const permissions = session.user.permissions ?? [];
  if (!canPostFactoryProduction(permissions, session.user.isSuperAdmin) && !permissions.includes('material.view')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const rows = await prisma.factoryProduction.findMany({
    where: { companyId },
    orderBy: [{ productionDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      warehouse: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      lines: {
        include: {
          material: { select: { id: true, name: true, unit: true } },
        },
      },
    },
  });

  return successResponse(
    rows.map((row) => ({
      id: row.id,
      productionDate: row.productionDate.toISOString().slice(0, 10),
      warehouseId: row.warehouse.id,
      warehouseName: row.warehouse.name,
      notes: row.notes,
      createdByName: row.createdBy.name,
      createdAt: row.createdAt,
      lines: row.lines.map((line) => ({
        id: line.id,
        materialId: line.material.id,
        materialName: line.material.name,
        unit: line.material.unit,
        quantity: decimalToNumberOrZero(line.quantity),
      })),
    }))
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canPostFactoryProduction(session.user.permissions ?? [], session.user.isSuperAdmin)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  if (!session.user.id) return errorResponse('Unauthorized', 401);
  const companyId = session.user.activeCompanyId;

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  let productionDateYmd: string;
  try {
    productionDateYmd = ymdFromInput(parsed.data.productionDate);
  } catch {
    return errorResponse('Invalid production date', 400);
  }

  try {
    const created = await prisma.$transaction((tx) =>
      postFactoryProduction(tx, {
        companyId,
        productionDate: dateFromYmd(productionDateYmd),
        warehouseId: parsed.data.warehouseId,
        notes: parsed.data.notes?.trim() || null,
        lines: parsed.data.lines,
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
        },
      })
    );
    return successResponse(created, 201);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to post factory production', 400);
  }
}
