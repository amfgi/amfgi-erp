import { consumeTransactionBatchQuantitiesBestEffort } from '@/lib/utils/transactionBatchLinks';
import { toStockQtyDecimal } from '@/lib/utils/decimal';

describe('consumeTransactionBatchQuantitiesBestEffort', () => {
  it('consumes only remaining batch quantity when stock was partially cleared', async () => {
    const batches = new Map<string, number>([['batch-1', 25]]);

    const tx = {
      stockBatch: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
          quantityAvailable: batches.get(where.id) ?? 0,
        })),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; quantityAvailable: { gte: { toNumber: () => number } | number } };
            data: { quantityAvailable: { decrement: { toNumber: () => number } | number } };
          }) => {
            const current = batches.get(where.id) ?? 0;
            const gte =
              typeof where.quantityAvailable.gte === 'number'
                ? where.quantityAvailable.gte
                : where.quantityAvailable.gte.toNumber();
            const decrement =
              typeof data.quantityAvailable.decrement === 'number'
                ? data.quantityAvailable.decrement
                : data.quantityAvailable.decrement.toNumber();
            if (current < gte) return { count: 0 };
            batches.set(where.id, current - decrement);
            return { count: 1 };
          }
        ),
      },
    };

    const consumed = await consumeTransactionBatchQuantitiesBestEffort(tx as never, [
      {
        batchId: 'batch-1',
        batchNumber: 'B-1',
        quantityFromBatch: 100,
        unitCost: 10,
        costAmount: 1000,
      },
    ]);

    expect(consumed).toBe(25);
    expect(batches.get('batch-1')).toBe(0);
  });

  it('returns zero when inbound batch was already cancelled', async () => {
    const tx = {
      stockBatch: {
        findUnique: jest.fn(async () => ({ quantityAvailable: 0 })),
        updateMany: jest.fn(),
      },
    };

    const consumed = await consumeTransactionBatchQuantitiesBestEffort(tx as never, [
      {
        batchId: 'batch-1',
        batchNumber: 'B-1',
        quantityFromBatch: 50,
        unitCost: 4,
        costAmount: 200,
      },
    ]);

    expect(consumed).toBe(0);
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
  });

  it('normalizes float quantities so Decimal gte matches stock qty precision', () => {
    const qty = toStockQtyDecimal(95.4);
    expect(qty.toString()).toBe('95.4');
    expect(qty.toFixed()).not.toContain('000000');
  });
});
