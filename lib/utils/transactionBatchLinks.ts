import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { decimalToNumberOrZero, roundStockQty, toStockQtyDecimal } from './decimal';

type Tx = PrismaClient | Prisma.TransactionClient;

const EPSILON = 0.0005;

export type TransactionBatchLinkInput = {
  batchId: string;
  batchNumber: string;
  quantityFromBatch: number;
  unitCost: number;
  costAmount: number;
};

export async function restoreTransactionBatchQuantities(
  tx: Tx,
  links: readonly TransactionBatchLinkInput[]
) {
  if (links.length === 0) return;
  for (const link of links) {
    const quantity = toStockQtyDecimal(link.quantityFromBatch);
    if (quantity.lte(0)) continue;
    await tx.stockBatch.update({
      where: { id: link.batchId },
      data: {
        quantityAvailable: {
          increment: quantity,
        },
      },
    });
  }
}

export async function consumeTransactionBatchQuantities(
  tx: Tx,
  links: readonly TransactionBatchLinkInput[],
  errorMessage: string
) {
  if (links.length === 0) return;
  for (const link of links) {
    const quantity = toStockQtyDecimal(link.quantityFromBatch);
    if (quantity.lte(0)) continue;
    const result = await tx.stockBatch.updateMany({
      where: {
        id: link.batchId,
        quantityAvailable: {
          gte: quantity,
        },
      },
      data: {
        quantityAvailable: {
          decrement: quantity,
        },
      },
    });
    if (result.count === 0) {
      throw new Error(errorMessage);
    }
  }
}

/**
 * Decrement batch availability up to each link amount (or remaining stock).
 * Used when unwinding transfers whose inbound batches were already cancelled or consumed.
 */
export async function consumeTransactionBatchQuantitiesBestEffort(
  tx: Tx,
  links: readonly TransactionBatchLinkInput[]
): Promise<number> {
  if (links.length === 0) return 0;

  let totalConsumed = 0;
  for (const link of links) {
    const batch = await tx.stockBatch.findUnique({
      where: { id: link.batchId },
      select: { quantityAvailable: true },
    });
    if (!batch) continue;

    const available = decimalToNumberOrZero(batch.quantityAvailable);
    if (available <= EPSILON) continue;

    const quantityToConsume = toStockQtyDecimal(
      Math.min(roundStockQty(link.quantityFromBatch), available)
    );
    if (quantityToConsume.lte(0)) continue;

    const result = await tx.stockBatch.updateMany({
      where: {
        id: link.batchId,
        quantityAvailable: { gte: quantityToConsume },
      },
      data: {
        quantityAvailable: { decrement: quantityToConsume },
      },
    });
    if (result.count > 0) {
      totalConsumed += quantityToConsume.toNumber();
    }
  }

  return totalConsumed;
}

export async function createTransactionBatchRecords(
  tx: Tx,
  transactionId: string,
  links: readonly TransactionBatchLinkInput[]
) {
  for (const link of links) {
    await tx.transactionBatch.create({
      data: {
        id: randomUUID(),
        transactionId,
        batchId: link.batchId,
        batchNumber: link.batchNumber,
        quantityFromBatch: link.quantityFromBatch,
        unitCost: link.unitCost,
        costAmount: link.costAmount,
      },
    });
  }
}

export function normalizeTransactionBatchLinks<
  T extends {
    batchId: string;
    batchNumber: string;
    quantityFromBatch: unknown;
    unitCost: unknown;
    costAmount: unknown;
  },
>(links: readonly T[]): TransactionBatchLinkInput[] {
  return links.map((link) => ({
    batchId: link.batchId,
    batchNumber: link.batchNumber,
    quantityFromBatch: roundStockQty(link.quantityFromBatch),
    unitCost: decimalToNumberOrZero(link.unitCost),
    costAmount: decimalToNumberOrZero(link.costAmount),
  }));
}
