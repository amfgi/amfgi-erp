import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export type DispatchRevisionLine = {
  transactionId: string;
  materialId: string;
  materialName: string;
  materialUnit: string;
  warehouseId: string | null;
  warehouseName: string | null;
  quantityBase: number;
  returnQtyBase: number;
};

export type DispatchRevisionChangeSummary = {
  added: DispatchRevisionLine[];
  removed: DispatchRevisionLine[];
  changed: Array<{
    materialId: string;
    warehouseId: string | null;
    materialName: string;
    changes: Array<{ field: string; before: string | number | null; after: string | number | null }>;
  }>;
};

function lineKey(materialId: string, warehouseId: string | null | undefined) {
  return `${materialId}::${warehouseId ?? ''}`;
}

export function postingDateKeyFromRequest(dateStr: string | undefined, txDate: Date): string {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return dateStr.trim();
  }
  const d = txDate;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function returnQtyBaseForStockOut(
  db: PrismaClient | Prisma.TransactionClient,
  companyId: string,
  stockOutId: string
): Promise<number> {
  const ret = await db.transaction.findFirst({
    where: {
      companyId,
      type: 'RETURN',
      parentTransactionId: stockOutId,
    },
    select: { quantity: true },
  });
  return ret ? decimalToNumberOrZero(ret.quantity) : 0;
}

/** Snapshot STOCK_OUT lines for the given transaction ids (before an update delete, or after create). */
export async function buildDispatchRevisionLinesFromStockOutIds(
  db: PrismaClient | Prisma.TransactionClient,
  companyId: string,
  transactionIds: string[]
): Promise<DispatchRevisionLine[]> {
  if (!transactionIds.length) return [];
  const rows = await db.transaction.findMany({
    where: {
      companyId,
      id: { in: transactionIds },
      type: 'STOCK_OUT',
    },
    select: {
      id: true,
      materialId: true,
      quantity: true,
      warehouseId: true,
      material: { select: { name: true, unit: true } },
      warehouse: { select: { id: true, name: true } },
      createdAt: true,
    },
  });

  rows.sort((a, b) => {
    const t = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (t !== 0) return t;
    if (a.materialId !== b.materialId) return a.materialId.localeCompare(b.materialId);
    return String(a.warehouseId ?? '').localeCompare(String(b.warehouseId ?? ''));
  });

  const out: DispatchRevisionLine[] = [];
  for (const txn of rows) {
    const returnQtyBase = await returnQtyBaseForStockOut(db, companyId, txn.id);
    out.push({
      transactionId: txn.id,
      materialId: txn.materialId,
      materialName: txn.material?.name ?? 'Unknown',
      materialUnit: txn.material?.unit ?? '',
      warehouseId: txn.warehouseId ?? txn.warehouse?.id ?? null,
      warehouseName: txn.warehouse?.name ?? null,
      quantityBase: decimalToNumberOrZero(txn.quantity),
      returnQtyBase,
    });
  }
  return out;
}

export function computeDispatchRevisionChangeSummary(
  before: DispatchRevisionLine[] | null,
  after: DispatchRevisionLine[]
): DispatchRevisionChangeSummary {
  const beforeMap = new Map<string, DispatchRevisionLine>();
  for (const row of before ?? []) {
    beforeMap.set(lineKey(row.materialId, row.warehouseId), row);
  }
  const afterMap = new Map<string, DispatchRevisionLine>();
  for (const row of after) {
    afterMap.set(lineKey(row.materialId, row.warehouseId), row);
  }

  const added: DispatchRevisionLine[] = [];
  const removed: DispatchRevisionLine[] = [];
  const changed: DispatchRevisionChangeSummary['changed'] = [];

  for (const [k, row] of afterMap) {
    const prev = beforeMap.get(k);
    if (!prev) {
      added.push(row);
      continue;
    }
    const fieldChanges: Array<{ field: string; before: string | number | null; after: string | number | null }> =
      [];
    if (Math.abs(prev.quantityBase - row.quantityBase) > 0.0005) {
      fieldChanges.push({
        field: 'dispatchQtyBase',
        before: prev.quantityBase,
        after: row.quantityBase,
      });
    }
    if (Math.abs(prev.returnQtyBase - row.returnQtyBase) > 0.0005) {
      fieldChanges.push({
        field: 'returnQtyBase',
        before: prev.returnQtyBase,
        after: row.returnQtyBase,
      });
    }
    if (fieldChanges.length) {
      changed.push({
        materialId: row.materialId,
        warehouseId: row.warehouseId,
        materialName: row.materialName,
        changes: fieldChanges,
      });
    }
  }

  for (const [k, row] of beforeMap) {
    if (!afterMap.has(k)) removed.push(row);
  }

  return { added, removed, changed };
}

export async function recordDispatchEntryRevision(args: {
  companyId: string;
  jobId: string;
  postingDateKey: string;
  source: 'WORKSHEET' | 'DELIVERY_NOTE';
  action: 'CREATE' | 'UPDATE';
  actorUserId: string | null;
  actorName: string;
  linesBefore: DispatchRevisionLine[] | null;
  linesAfter: DispatchRevisionLine[];
  notesSnippet: string | null;
}): Promise<void> {
  let changeSummary: Prisma.InputJsonValue;
  if (args.action === 'CREATE') {
    changeSummary = { kind: 'create' as const };
  } else if (args.linesBefore === null) {
    changeSummary = { kind: 'update' as const, previousSnapshotUnavailable: true };
  } else {
    changeSummary = computeDispatchRevisionChangeSummary(
      args.linesBefore,
      args.linesAfter
    ) as unknown as Prisma.InputJsonValue;
  }
  await prisma.dispatchEntryRevision.create({
    data: {
      companyId: args.companyId,
      jobId: args.jobId,
      postingDateKey: args.postingDateKey,
      source: args.source,
      action: args.action,
      actorUserId: args.actorUserId,
      actorName: args.actorName,
      ...(args.linesBefore != null
        ? { linesBefore: args.linesBefore as unknown as Prisma.InputJsonValue }
        : {}),
      linesAfter: args.linesAfter as unknown as Prisma.InputJsonValue,
      changeSummary: changeSummary as unknown as Prisma.InputJsonValue,
      notesSnippet: args.notesSnippet,
    },
  });
}
