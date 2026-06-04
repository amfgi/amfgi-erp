/**
 * Same-company warehouse transfer: FIFO out from source warehouse, batches in at destination.
 * Company material total quantity is unchanged; only warehouse balances move.
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import {
  executeWarehouseTransferBatch,
  type WarehouseTransferLineInput,
} from '@/lib/stock/executeWarehouseTransfer';
import { canTransferWarehouse } from '@/lib/permissions/stockModuleAccess';
import { z } from 'zod';

const LineSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().min(0.001),
  quantityUomId: z.string().optional(),
});

const SingleTransferSchema = z.object({
  materialId: z.string().min(1),
  sourceWarehouseId: z.string().min(1),
  destinationWarehouseId: z.string().min(1),
  quantity: z.number().min(0.001),
  quantityUomId: z.string().optional(),
  notes: z.string().max(20000).optional(),
  date: z.string().optional(),
});

const BatchTransferSchema = z.object({
  sourceWarehouseId: z.string().min(1),
  destinationWarehouseId: z.string().min(1),
  lines: z.array(LineSchema).min(1).max(200),
  notes: z.string().max(20000).optional(),
  date: z.string().optional(),
});

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canTransferWarehouse(session.user.permissions, session.user.isSuperAdmin)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const batchParsed = BatchTransferSchema.safeParse(body);
  const singleParsed = batchParsed.success ? null : SingleTransferSchema.safeParse(body);

  if (!batchParsed.success && !singleParsed?.success) {
    const issue = batchParsed.error.issues[0] ?? singleParsed?.error.issues[0];
    return errorResponse(issue?.message ?? 'Validation error', 422);
  }

  const companyId = session.user.activeCompanyId;

  let sourceWarehouseId: string;
  let destinationWarehouseId: string;
  let lines: WarehouseTransferLineInput[];
  let notes: string | undefined;
  let date: Date | undefined;

  if (batchParsed.success) {
    sourceWarehouseId = batchParsed.data.sourceWarehouseId;
    destinationWarehouseId = batchParsed.data.destinationWarehouseId;
    lines = batchParsed.data.lines;
    notes = batchParsed.data.notes;
    date = batchParsed.data.date ? new Date(batchParsed.data.date) : undefined;
  } else if (singleParsed?.success) {
    const data = singleParsed.data;
    sourceWarehouseId = data.sourceWarehouseId;
    destinationWarehouseId = data.destinationWarehouseId;
    lines = [
      {
        materialId: data.materialId,
        quantity: data.quantity,
        quantityUomId: data.quantityUomId,
      },
    ];
    notes = data.notes;
    date = data.date ? new Date(data.date) : undefined;
  } else {
    return errorResponse('Validation error', 422);
  }

  if (sourceWarehouseId === destinationWarehouseId) {
    return errorResponse('Source and destination warehouse must be different', 422);
  }

  const materialIds = new Set<string>();
  for (const line of lines) {
    if (materialIds.has(line.materialId)) {
      return errorResponse('Duplicate material on transfer lines — combine quantities into one row', 422);
    }
    materialIds.add(line.materialId);
  }

  try {
    const result = await prisma.$transaction(async (tx: Tx) =>
      executeWarehouseTransferBatch(tx, companyId, session.user, {
        sourceWarehouseId,
        destinationWarehouseId,
        lines,
        notes,
        date,
      }),
    );

    publishLiveUpdate({
      companyId,
      channel: 'stock',
      entity: 'warehouse_transfer',
      action: 'created',
    });

    if (lines.length === 1 && batchParsed.success === false) {
      const line = result.lines[0]!;
      return successResponse(
        {
          transferredQty: line.transferredQty,
          materialName: line.materialName,
          sourceWarehouse: result.sourceWarehouse,
          destinationWarehouse: result.destinationWarehouse,
          transferOutId: line.transferOutId,
          transferInId: line.transferInId,
          transferGroupId: result.transferGroupId,
        },
        201,
      );
    }

    return successResponse(
      {
        transferGroupId: result.transferGroupId,
        sourceWarehouse: result.sourceWarehouse,
        destinationWarehouse: result.destinationWarehouse,
        lineCount: result.lines.length,
        lines: result.lines,
      },
      201,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Warehouse transfer failed';
    return errorResponse(message, 400);
  }
}
