import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { buildTransactionActorFields, type AuditActorUser } from '@/lib/utils/auditActor';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { createTransactionBatchRecords } from '@/lib/utils/transactionBatchLinks';
import { applyMaterialWarehouseDelta } from '@/lib/warehouses/stockWarehouses';

const PRODUCTION_REFERENCE_TYPE = 'JOB_ITEM_PROGRESS_ENTRY';
const PRODUCTION_REVERSAL_REFERENCE_TYPE = 'JOB_ITEM_PROGRESS_ENTRY_REVERSAL';

type Tx = Prisma.TransactionClient;

type PostingParams = {
  companyId: string;
  progressEntryId: string;
  jobItemId: string;
  trackerId: string | null | undefined;
  quantity: number;
  entryDate: Date;
  user: AuditActorUser;
};

function productionBatchNumber(progressEntryId: string) {
  return `PROD-${progressEntryId.slice(-10).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

function productionNote(label: string, progressEntryId: string) {
  return `Production stock-in for ${label} [PROGRESS_ENTRY:${progressEntryId}]`;
}

async function reduceMaterialStockOrThrow(
  tx: Tx,
  materialId: string,
  quantity: number,
  materialName: string
) {
  const result = await tx.material.updateMany({
    where: {
      id: materialId,
      currentStock: {
        gte: quantity,
      },
    },
    data: {
      currentStock: {
        decrement: quantity,
      },
    },
  });
  if (result.count === 0) {
    throw new Error(`Cannot reduce production stock for ${materialName}; some quantity has already been dispatched.`);
  }
}

async function reduceWarehouseStockOrThrow(
  tx: Tx,
  companyId: string,
  materialId: string,
  warehouseId: string,
  quantity: number,
  materialName: string
) {
  const result = await tx.materialWarehouseStock.updateMany({
    where: {
      companyId,
      materialId,
      warehouseId,
      currentStock: {
        gte: quantity,
      },
    },
    data: {
      currentStock: {
        decrement: quantity,
      },
    },
  });
  if (result.count === 0) {
    throw new Error(`Cannot reduce production stock for ${materialName}; warehouse stock has already been dispatched.`);
  }
}

async function reduceBatchOrThrow(
  tx: Tx,
  stockBatchId: string,
  quantity: number,
  materialName: string
) {
  const batch = await tx.stockBatch.findUnique({
    where: { id: stockBatchId },
    select: {
      id: true,
      batchNumber: true,
      quantityAvailable: true,
    },
  });
  if (!batch || decimalToNumberOrZero(batch.quantityAvailable) < quantity) {
    throw new Error(`Cannot reduce production stock for ${materialName}; produced batch has already been dispatched.`);
  }
  return batch;
}

export async function postProductionStockForProgressEntry(tx: Tx, params: PostingParams) {
  const trackerId = params.trackerId?.trim();
  if (!trackerId || params.quantity <= 0) return null;

  const existingPosting = await tx.productionStockPosting.findUnique({
    where: {
      companyId_progressEntryId: {
        companyId: params.companyId,
        progressEntryId: params.progressEntryId,
      },
    },
  });
  if (existingPosting) return existingPosting;

  const link = await tx.jobItemTrackableMaterialLink.findUnique({
    where: {
      companyId_jobItemId_trackerId: {
        companyId: params.companyId,
        jobItemId: params.jobItemId,
        trackerId,
      },
    },
    include: {
      jobItem: {
        select: {
          id: true,
          jobId: true,
          name: true,
        },
      },
      material: true,
      warehouse: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  if (!link) return null;

  const actorFields = buildTransactionActorFields(params.user);
  const unitCost = decimalToNumberOrZero(link.material.unitCost);
  const totalCost = unitCost * params.quantity;
  const note = productionNote(link.jobItem.name, params.progressEntryId);

  await tx.material.update({
    where: { id: link.materialId },
    data: {
      currentStock: {
        increment: params.quantity,
      },
    },
  });
  await applyMaterialWarehouseDelta(tx, params.companyId, link.materialId, link.warehouseId, params.quantity);

  const batch = await tx.stockBatch.create({
    data: {
      id: randomUUID(),
      companyId: params.companyId,
      materialId: link.materialId,
      warehouseId: link.warehouseId,
      batchNumber: productionBatchNumber(params.progressEntryId),
      quantityReceived: params.quantity,
      quantityAvailable: params.quantity,
      unitCost,
      totalCost,
      supplier: 'Production',
      receivedDate: params.entryDate,
      notes: note,
      updatedAt: new Date(),
    },
  });

  const transaction = await tx.transaction.create({
    data: {
      id: randomUUID(),
      companyId: params.companyId,
      type: 'STOCK_IN',
      materialId: link.materialId,
      warehouseId: link.warehouseId,
      quantity: params.quantity,
      jobId: link.jobItem.jobId,
      notes: note,
      date: params.entryDate,
      totalCost,
      averageCost: unitCost,
      sourceModule: 'production',
      referenceType: PRODUCTION_REFERENCE_TYPE,
      referenceId: params.progressEntryId,
      meta: {
        jobItemId: params.jobItemId,
        trackerId,
        trackableMaterialLinkId: link.id,
      },
      updatedAt: new Date(),
      ...actorFields,
    },
  });

  return tx.productionStockPosting.create({
    data: {
      id: randomUUID(),
      companyId: params.companyId,
      progressEntryId: params.progressEntryId,
      jobItemId: params.jobItemId,
      trackerId,
      trackableMaterialLinkId: link.id,
      materialId: link.materialId,
      warehouseId: link.warehouseId,
      transactionId: transaction.id,
      stockBatchId: batch.id,
      quantity: params.quantity,
      status: 'POSTED',
      updatedAt: new Date(),
    },
  });
}

export async function syncProductionStockPostingForProgressEntry(tx: Tx, params: PostingParams) {
  const posting = await tx.productionStockPosting.findUnique({
    where: {
      companyId_progressEntryId: {
        companyId: params.companyId,
        progressEntryId: params.progressEntryId,
      },
    },
    include: {
      material: {
        select: {
          id: true,
          name: true,
          unitCost: true,
        },
      },
    },
  });

  if (!posting) {
    return postProductionStockForProgressEntry(tx, params);
  }
  if (posting.status === 'REVERSED') {
    throw new Error('Cannot update a production stock posting after it has been reversed.');
  }

  const nextQuantity = params.quantity;
  const currentQuantity = decimalToNumberOrZero(posting.quantity);
  const delta = nextQuantity - currentQuantity;
  const unitCost = decimalToNumberOrZero(posting.material.unitCost);
  const nextTotalCost = unitCost * nextQuantity;

  if (Math.abs(delta) < 0.0005) {
    await tx.transaction.update({
      where: { id: posting.transactionId },
      data: {
        date: params.entryDate,
        totalCost: nextTotalCost,
        averageCost: unitCost,
      },
    });
    return posting;
  }

  if (delta > 0) {
    await tx.material.update({
      where: { id: posting.materialId },
      data: {
        currentStock: {
          increment: delta,
        },
      },
    });
    await applyMaterialWarehouseDelta(tx, params.companyId, posting.materialId, posting.warehouseId, delta);
    await tx.stockBatch.update({
      where: { id: posting.stockBatchId },
      data: {
        quantityReceived: {
          increment: delta,
        },
        quantityAvailable: {
          increment: delta,
        },
        totalCost: nextTotalCost,
        unitCost,
        receivedDate: params.entryDate,
      },
    });
  } else {
    const reduction = Math.abs(delta);
    await reduceBatchOrThrow(tx, posting.stockBatchId, reduction, posting.material.name);
    await reduceMaterialStockOrThrow(tx, posting.materialId, reduction, posting.material.name);
    await reduceWarehouseStockOrThrow(
      tx,
      params.companyId,
      posting.materialId,
      posting.warehouseId,
      reduction,
      posting.material.name
    );
    await tx.stockBatch.update({
      where: { id: posting.stockBatchId },
      data: {
        quantityReceived: {
          decrement: reduction,
        },
        quantityAvailable: {
          decrement: reduction,
        },
        totalCost: nextTotalCost,
        unitCost,
        receivedDate: params.entryDate,
      },
    });
  }

  await tx.transaction.update({
    where: { id: posting.transactionId },
    data: {
      quantity: nextQuantity,
      date: params.entryDate,
      totalCost: nextTotalCost,
      averageCost: unitCost,
    },
  });

  return tx.productionStockPosting.update({
    where: { id: posting.id },
    data: {
      quantity: nextQuantity,
    },
  });
}

export async function reverseProductionStockPostingForProgressEntry(
  tx: Tx,
  companyId: string,
  progressEntryId: string,
  user: AuditActorUser
) {
  const posting = await tx.productionStockPosting.findUnique({
    where: {
      companyId_progressEntryId: {
        companyId,
        progressEntryId,
      },
    },
    include: {
      material: {
        select: {
          id: true,
          name: true,
          unitCost: true,
        },
      },
      stockBatch: {
        select: {
          id: true,
          batchNumber: true,
        },
      },
    },
  });

  if (!posting || posting.status === 'REVERSED') return null;
  const quantity = decimalToNumberOrZero(posting.quantity);
  if (quantity <= 0) {
    return tx.productionStockPosting.update({
      where: { id: posting.id },
      data: {
        status: 'REVERSED',
        reversedAt: new Date(),
      },
    });
  }

  await reduceBatchOrThrow(tx, posting.stockBatchId, quantity, posting.material.name);
  await reduceMaterialStockOrThrow(tx, posting.materialId, quantity, posting.material.name);
  await reduceWarehouseStockOrThrow(tx, companyId, posting.materialId, posting.warehouseId, quantity, posting.material.name);
  await tx.stockBatch.update({
    where: { id: posting.stockBatchId },
    data: {
      quantityReceived: {
        decrement: quantity,
      },
      quantityAvailable: {
        decrement: quantity,
      },
    },
  });

  const actorFields = buildTransactionActorFields(user);
  const unitCost = decimalToNumberOrZero(posting.material.unitCost);
  const reversedAt = new Date();
  const reversal = await tx.transaction.create({
    data: {
      id: randomUUID(),
      companyId,
      type: 'REVERSAL',
      materialId: posting.materialId,
      warehouseId: posting.warehouseId,
      quantity,
      parentTransactionId: posting.transactionId,
      notes: `Production stock reversal [PROGRESS_ENTRY:${progressEntryId}]`,
      date: reversedAt,
      totalCost: unitCost * quantity,
      averageCost: unitCost,
      sourceModule: 'production',
      referenceType: PRODUCTION_REVERSAL_REFERENCE_TYPE,
      referenceId: progressEntryId,
      updatedAt: new Date(),
      ...actorFields,
    },
  });

  await createTransactionBatchRecords(tx, reversal.id, [
    {
      batchId: posting.stockBatchId,
      batchNumber: posting.stockBatch.batchNumber,
      quantityFromBatch: quantity,
      unitCost,
      costAmount: unitCost * quantity,
    },
  ]);

  return tx.productionStockPosting.update({
    where: { id: posting.id },
    data: {
      quantity: 0,
      status: 'REVERSED',
      reversedAt,
      reversalTransactionId: reversal.id,
    },
  });
}
