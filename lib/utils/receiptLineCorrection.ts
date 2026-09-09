import { Prisma } from '@prisma/client';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import {
  buildReceiptCorrectionNotes,
  buildReceiptCorrectionTransactionNote,
  parseReceiptCancellationMetadata,
} from '@/lib/utils/receiptCancellation';
import {
  buildStockBatchReceiptLineMeta,
  parseReceiptLineMetadata,
} from '@/lib/utils/receiptLineMetadata';
import { upsertStockExceptionApproval } from '@/lib/utils/stockExceptionApproval';
import { applyMaterialWarehouseDelta } from '@/lib/warehouses/stockWarehouses';

const CORRECTION_TOLERANCE = 0.0005;

type Tx = Prisma.TransactionClient;

export type ReceiptLineCorrectionInput = {
  batchId: string;
  quantityReceived?: number;
  unitCost?: number;
  displayQuantity?: number;
  displayUnitCost?: number;
};

export type ReceiptLineCorrectionDownstreamChange = {
  transactionId: string;
  type: string;
  jobNumber: string | null;
  costBefore: number;
  costAfter: number;
  costDelta: number;
};

export type ReceiptLineCorrectionLineResult = {
  batchId: string;
  materialId: string;
  materialName: string;
  unit: string;
  before: {
    quantityReceived: number;
    quantityAvailable: number;
    unitCost: number;
    totalCost: number;
    quantityConsumed: number;
  };
  after: {
    quantityReceived: number;
    quantityAvailable: number;
    unitCost: number;
    totalCost: number;
  };
  stockDelta: number;
  downstreamTransactions: ReceiptLineCorrectionDownstreamChange[];
};

export type ReceiptLineCorrectionResult = {
  corrected: boolean;
  dryRun: boolean;
  requested?: boolean;
  approvalId?: string | null;
  status?: 'PENDING' | 'APPROVED' | null;
  receiptNumber: string;
  correctedAt: string | null;
  reason: string;
  lines: ReceiptLineCorrectionLineResult[];
};

export type ReceiptLineCorrectionRequestPayload = {
  correctionType: 'LINE_CORRECTION';
  receiptNumber: string;
  requestedAt: string;
  inputLines: ReceiptLineCorrectionInput[];
  lines: ReceiptLineCorrectionLineResult[];
};

type LoadedBatch = {
  id: string;
  companyId: string;
  materialId: string;
  warehouseId: string | null;
  batchNumber: string;
  receiptNumber: string | null;
  notes: string | null;
  meta: Prisma.JsonValue | null;
  quantityReceived: Prisma.Decimal;
  quantityAvailable: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  material: { id: string; name: string; unit: string } | null;
  transactionLinks: Array<{
    id: string;
    transactionId: string;
    quantityFromBatch: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    costAmount: Prisma.Decimal;
    transaction: {
      id: string;
      type: string;
      quantity: Prisma.Decimal;
      totalCost: Prisma.Decimal;
      averageCost: Prisma.Decimal;
      notes: string | null;
      job: { jobNumber: string | null } | null;
    };
  }>;
};

function d(value: number) {
  return new Prisma.Decimal(value);
}

function quantityAdjustedFromLinks(
  links: LoadedBatch['transactionLinks'],
  receiptNumber: string
) {
  return links.reduce((sum, link) => {
    const isReceiptAdjustmentReversal =
      link.transaction.type === 'REVERSAL' &&
      (link.transaction.notes ?? '').includes(`Receipt adjustment for ${receiptNumber}`);
    return isReceiptAdjustmentReversal
      ? sum + decimalToNumberOrZero(link.quantityFromBatch)
      : sum;
  }, 0);
}

export function buildLinePlan(
  batch: LoadedBatch,
  input: ReceiptLineCorrectionInput,
  receiptNumber: string
): ReceiptLineCorrectionLineResult {
  const quantityReceivedBefore = decimalToNumberOrZero(batch.quantityReceived);
  const quantityAvailableBefore = decimalToNumberOrZero(batch.quantityAvailable);
  const unitCostBefore = decimalToNumberOrZero(batch.unitCost);
  const totalCostBefore = decimalToNumberOrZero(batch.totalCost);
  const quantityAdjusted = quantityAdjustedFromLinks(batch.transactionLinks, receiptNumber);
  const quantityConsumed = Math.max(
    0,
    quantityReceivedBefore - quantityAvailableBefore - quantityAdjusted
  );

  const quantityReceivedAfter = input.quantityReceived ?? quantityReceivedBefore;
  const unitCostAfter = input.unitCost ?? unitCostBefore;

  if (!Number.isFinite(quantityReceivedAfter) || quantityReceivedAfter < quantityConsumed - CORRECTION_TOLERANCE) {
    throw new Error(
      `${batch.material?.name ?? 'Material'} received quantity cannot be less than already consumed (${quantityConsumed.toFixed(3)} ${batch.material?.unit ?? ''})`
    );
  }
  if (!Number.isFinite(unitCostAfter) || unitCostAfter <= 0) {
    throw new Error(`${batch.material?.name ?? 'Material'} unit cost must be greater than zero`);
  }

  const quantityAvailableAfter = quantityReceivedAfter - quantityConsumed;
  const stockDelta = quantityAvailableAfter - quantityAvailableBefore;
  const totalCostAfter = quantityReceivedAfter * unitCostAfter;

  const downstreamByTransaction = new Map<string, ReceiptLineCorrectionDownstreamChange>();
  for (const link of batch.transactionLinks) {
    if (link.transaction.type === 'REVERSAL') continue;

    const quantityFromBatch = decimalToNumberOrZero(link.quantityFromBatch);
    const costBefore = decimalToNumberOrZero(link.costAmount);
    const costAfter = quantityFromBatch * unitCostAfter;
    const existing = downstreamByTransaction.get(link.transactionId);

    if (existing) {
      existing.costBefore += costBefore;
      existing.costAfter += costAfter;
      existing.costDelta = existing.costAfter - existing.costBefore;
      continue;
    }

    downstreamByTransaction.set(link.transactionId, {
      transactionId: link.transactionId,
      type: link.transaction.type,
      jobNumber: link.transaction.job?.jobNumber ?? null,
      costBefore,
      costAfter,
      costDelta: costAfter - costBefore,
    });
  }

  const hasQuantityChange = Math.abs(quantityReceivedAfter - quantityReceivedBefore) > CORRECTION_TOLERANCE;
  const hasCostChange = Math.abs(unitCostAfter - unitCostBefore) > CORRECTION_TOLERANCE;
  if (!hasQuantityChange && !hasCostChange) {
    throw new Error(`${batch.material?.name ?? 'Material'} has no changes to apply`);
  }

  return {
    batchId: batch.id,
    materialId: batch.materialId,
    materialName: batch.material?.name ?? 'Unknown',
    unit: batch.material?.unit ?? '—',
    before: {
      quantityReceived: quantityReceivedBefore,
      quantityAvailable: quantityAvailableBefore,
      unitCost: unitCostBefore,
      totalCost: totalCostBefore,
      quantityConsumed,
    },
    after: {
      quantityReceived: quantityReceivedAfter,
      quantityAvailable: quantityAvailableAfter,
      unitCost: unitCostAfter,
      totalCost: totalCostAfter,
    },
    stockDelta,
    downstreamTransactions: Array.from(downstreamByTransaction.values()),
  };
}

async function loadReceiptBatches(
  tx: Tx,
  companyId: string,
  receiptNumber: string,
  batchIds: string[]
) {
  const batches = await tx.stockBatch.findMany({
    where: {
      companyId,
      receiptNumber,
      id: { in: batchIds },
    },
    include: {
      material: { select: { id: true, name: true, unit: true } },
      transactionLinks: {
        include: {
          transaction: {
            select: {
              id: true,
              type: true,
              quantity: true,
              totalCost: true,
              averageCost: true,
              notes: true,
              job: { select: { jobNumber: true } },
            },
          },
        },
      },
    },
  });

  if (batches.length !== batchIds.length) {
    throw new Error('One or more receipt lines were not found on this bill');
  }

  if (batches.some((batch) => parseReceiptCancellationMetadata(batch.notes).isCancelled)) {
    throw new Error('Cancelled receipts cannot be corrected');
  }

  return batches as LoadedBatch[];
}

async function recalculateParentTransaction(tx: Tx, transactionId: string) {
  const links = await tx.transactionBatch.findMany({
    where: { transactionId },
  });
  const totalCost = links.reduce((sum, link) => sum + decimalToNumberOrZero(link.costAmount), 0);
  const transaction = await tx.transaction.findUnique({
    where: { id: transactionId },
    select: { quantity: true, notes: true },
  });
  if (!transaction) return;

  const quantity = decimalToNumberOrZero(transaction.quantity);
  const averageCost = quantity > CORRECTION_TOLERANCE ? totalCost / quantity : 0;

  await tx.transaction.update({
    where: { id: transactionId },
    data: {
      totalCost: d(totalCost),
      averageCost: d(averageCost),
    },
  });
}

export async function requestReceiptLineCorrection(args: {
  tx: Tx;
  companyId: string;
  receiptNumber: string;
  reason: string;
  lines: ReceiptLineCorrectionInput[];
  dryRun?: boolean;
  actor?: {
    id?: string | null;
    name?: string | null;
  };
}): Promise<ReceiptLineCorrectionResult> {
  const { tx, companyId, receiptNumber, reason, lines, dryRun = false, actor } = args;

  if (lines.length === 0) {
    throw new Error('At least one line correction is required');
  }

  const uniqueBatchIds = Array.from(new Set(lines.map((line) => line.batchId)));
  if (uniqueBatchIds.length !== lines.length) {
    throw new Error('Duplicate batch lines are not allowed');
  }

  const pending = await tx.stockExceptionApproval.findFirst({
    where: {
      companyId,
      exceptionType: 'RECEIPT_LINE_CORRECTION',
      referenceNumber: receiptNumber,
      status: 'PENDING',
    },
    select: { id: true },
  });
  if (pending) {
    throw new Error('A pending correction request already exists for this receipt');
  }

  const batches = await loadReceiptBatches(tx, companyId, receiptNumber, uniqueBatchIds);
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const linePlans = lines.map((line) => {
    const batch = batchById.get(line.batchId);
    if (!batch) throw new Error('Receipt line not found');
    return buildLinePlan(batch, line, receiptNumber);
  });

  if (dryRun) {
    return {
      corrected: false,
      dryRun: true,
      requested: false,
      receiptNumber,
      correctedAt: null,
      reason,
      lines: linePlans,
    };
  }

  const requestedAt = new Date();
  const referenceId = `${receiptNumber}:line-correction:${requestedAt.getTime()}`;
  const payload: ReceiptLineCorrectionRequestPayload = {
    correctionType: 'LINE_CORRECTION',
    receiptNumber,
    requestedAt: requestedAt.toISOString(),
    inputLines: lines,
    lines: linePlans,
  };

  const approval = await upsertStockExceptionApproval(tx, {
    companyId,
    exceptionType: 'RECEIPT_LINE_CORRECTION',
    referenceId,
    referenceNumber: receiptNumber,
    reason,
    payload,
    createdById: actor?.id ?? null,
    createdByName: actor?.name ?? null,
    status: 'PENDING',
  });

  return {
    corrected: false,
    dryRun: false,
    requested: true,
    approvalId: approval.id,
    status: 'PENDING',
    receiptNumber,
    correctedAt: null,
    reason,
    lines: linePlans,
  };
}

export async function applyReceiptLineCorrections(args: {
  tx: Tx;
  companyId: string;
  receiptNumber: string;
  reason: string;
  lines: ReceiptLineCorrectionInput[];
  dryRun?: boolean;
  actor?: {
    id?: string | null;
    name?: string | null;
    isSuperAdmin?: boolean;
  };
  approvalId?: string | null;
  decidedBy?: {
    id?: string | null;
    name?: string | null;
  };
  decisionNote?: string | null;
}): Promise<ReceiptLineCorrectionResult> {
  const {
    tx,
    companyId,
    receiptNumber,
    reason,
    lines,
    dryRun = false,
    actor,
    approvalId,
    decidedBy,
    decisionNote,
  } = args;

  if (lines.length === 0) {
    throw new Error('At least one line correction is required');
  }

  const uniqueBatchIds = Array.from(new Set(lines.map((line) => line.batchId)));
  if (uniqueBatchIds.length !== lines.length) {
    throw new Error('Duplicate batch lines are not allowed');
  }

  const batches = await loadReceiptBatches(tx, companyId, receiptNumber, uniqueBatchIds);
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const linePlans = lines.map((line) => {
    const batch = batchById.get(line.batchId);
    if (!batch) throw new Error('Receipt line not found');
    return buildLinePlan(batch, line, receiptNumber);
  });

  if (dryRun) {
    return {
      corrected: false,
      dryRun: true,
      receiptNumber,
      correctedAt: null,
      reason,
      lines: linePlans,
    };
  }

  const correctedAt = new Date();
  const correctedAtIso = correctedAt.toISOString();
  const correctionMarker = `[GRN-CORRECTION:${receiptNumber}]`;

  for (const plan of linePlans) {
    const batch = batchById.get(plan.batchId)!;
    const input = lines.find((line) => line.batchId === plan.batchId);
    if (!input) {
      throw new Error('Receipt line correction input mismatch');
    }
    const lineMeta = parseReceiptLineMetadata(batch.meta);
    const displayQuantity = input.displayQuantity ?? input.quantityReceived ?? plan.after.quantityReceived;
    const displayUnitCost = input.displayUnitCost ?? input.unitCost ?? plan.after.unitCost;
    const receiptLineMeta = buildStockBatchReceiptLineMeta({
      quantityUomId: lineMeta.quantityUomId,
      displayQuantity,
      displayUnitCost,
    });
    const nextMeta: Prisma.InputJsonValue | undefined = receiptLineMeta
      ? batch.meta && typeof batch.meta === 'object' && !Array.isArray(batch.meta)
        ? ({
            ...(batch.meta as Record<string, unknown>),
            ...(receiptLineMeta as Record<string, unknown>),
          } as Prisma.InputJsonValue)
        : receiptLineMeta
      : undefined;

    await tx.stockBatch.update({
      where: { id: plan.batchId },
      data: {
        quantityReceived: d(plan.after.quantityReceived),
        quantityAvailable: d(plan.after.quantityAvailable),
        unitCost: d(plan.after.unitCost),
        totalCost: d(plan.after.totalCost),
        ...(nextMeta ? { meta: nextMeta } : {}),
        notes: buildReceiptCorrectionNotes(batch.notes, correctedAtIso, reason),
      },
    });

    const stockInTxn = await tx.transaction.findFirst({
      where: {
        companyId,
        materialId: plan.materialId,
        type: 'STOCK_IN',
        notes: { contains: `[RECEIPT:${receiptNumber}]` },
      },
      select: { id: true, notes: true },
    });

    if (stockInTxn) {
      await tx.transaction.update({
        where: { id: stockInTxn.id },
        data: {
          quantity: d(plan.after.quantityReceived),
          averageCost: d(plan.after.unitCost),
          totalCost: d(plan.after.totalCost),
          notes: stockInTxn.notes
            ? `${stockInTxn.notes}\n${correctionMarker} ${reason}`
            : `[RECEIPT:${receiptNumber}] ${correctionMarker} ${reason}`,
        },
      });
    }

    const affectedTransactionIds = new Set<string>();
    for (const link of batch.transactionLinks) {
      if (link.transaction.type === 'REVERSAL') continue;

      const quantityFromBatch = decimalToNumberOrZero(link.quantityFromBatch);
      const costAfter = quantityFromBatch * plan.after.unitCost;

      await tx.transactionBatch.update({
        where: { id: link.id },
        data: {
          unitCost: d(plan.after.unitCost),
          costAmount: d(costAfter),
        },
      });
      affectedTransactionIds.add(link.transactionId);
    }

    for (const transactionId of affectedTransactionIds) {
      const parent = await tx.transaction.findUnique({
        where: { id: transactionId },
        select: { notes: true },
      });
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          notes: parent?.notes
            ? `${parent.notes}\n${buildReceiptCorrectionTransactionNote(receiptNumber, batch.batchNumber, reason)}`
            : buildReceiptCorrectionTransactionNote(receiptNumber, batch.batchNumber, reason),
        },
      });
      await recalculateParentTransaction(tx, transactionId);
    }

    if (Math.abs(plan.stockDelta) > CORRECTION_TOLERANCE && batch.warehouseId) {
      await tx.material.update({
        where: { id: plan.materialId },
        data: {
          currentStock: {
            increment: d(plan.stockDelta),
          },
        },
      });

      await applyMaterialWarehouseDelta(
        tx,
        companyId,
        plan.materialId,
        batch.warehouseId,
        plan.stockDelta
      );
    }
  }

  if (approvalId) {
    await tx.stockExceptionApproval.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        decidedById: decidedBy?.id ?? actor?.id ?? null,
        decidedByName: decidedBy?.name ?? actor?.name ?? null,
        decidedAt: correctedAt,
        decisionNote: decisionNote ?? 'Approved receipt line correction.',
        payload: {
          correctionType: 'LINE_CORRECTION',
          receiptNumber,
          correctedAt: correctedAtIso,
          appliedAt: correctedAtIso,
          inputLines: lines,
          lines: linePlans,
        },
      },
    });
  }

  return {
    corrected: true,
    dryRun: false,
    status: 'APPROVED',
    receiptNumber,
    correctedAt: correctedAtIso,
    reason,
    lines: linePlans,
  };
}
