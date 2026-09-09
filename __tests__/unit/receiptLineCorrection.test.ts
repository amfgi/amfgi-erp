import { Prisma } from '@prisma/client';
import { buildLinePlan } from '@/lib/utils/receiptLineCorrection';

describe('buildLinePlan', () => {
  const batch = {
    id: 'batch-1',
    companyId: 'company-1',
    materialId: 'material-1',
    warehouseId: 'warehouse-1',
    batchNumber: 'BATCH-1',
    receiptNumber: 'GRN-TEST',
    notes: null,
    meta: null,
    quantityReceived: new Prisma.Decimal(11.6),
    quantityAvailable: new Prisma.Decimal(0),
    unitCost: new Prisma.Decimal(2925),
    totalCost: new Prisma.Decimal(33930),
    material: { id: 'material-1', name: 'Resin Polypol 1003', unit: 'Kg' },
    transactionLinks: [
      {
        id: 'link-1',
        transactionId: 'txn-1',
        quantityFromBatch: new Prisma.Decimal(11.6),
        unitCost: new Prisma.Decimal(2925),
        costAmount: new Prisma.Decimal(33930),
        transaction: {
          id: 'txn-1',
          type: 'STOCK_OUT',
          quantity: new Prisma.Decimal(900),
          totalCost: new Prisma.Decimal(43226.6),
          averageCost: new Prisma.Decimal(48.0296),
          notes: null,
          job: { jobNumber: 'J25-2171-1' },
        },
      },
    ],
  } as never;

  it('recalculates swapped quantity and unit cost while preserving consumed quantity', () => {
    const plan = buildLinePlan(
      batch,
      {
        batchId: 'batch-1',
        quantityReceived: 2925,
        unitCost: 11.6,
      },
      'GRN-TEST'
    );

    expect(plan.after.quantityReceived).toBe(2925);
    expect(plan.after.quantityAvailable).toBe(2913.4);
    expect(plan.after.unitCost).toBe(11.6);
    expect(plan.stockDelta).toBe(2913.4);
    expect(plan.downstreamTransactions[0]?.costAfter).toBe(134.56);
    expect(plan.downstreamTransactions[0]?.costDelta).toBe(-33795.44);
  });
});
