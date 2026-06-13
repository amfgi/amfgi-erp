import { aggregatePeriodConsumption } from '@/lib/reports/monthlyJobSummary';

describe('aggregatePeriodConsumption', () => {
  it('keeps separate rows per material id when using internal names', () => {
    const rows = aggregatePeriodConsumption(
      [
        {
          type: 'STOCK_OUT',
          quantity: 10,
          materialId: 'mat-a',
          material: { name: 'Cement A', externalItemName: 'QB-CEMENT', unit: 'bag' },
          totalCost: 200,
          batchesUsed: [],
        },
        {
          type: 'STOCK_OUT',
          quantity: 5,
          materialId: 'mat-b',
          material: { name: 'Cement B', externalItemName: 'QB-CEMENT', unit: 'bag' },
          totalCost: 150,
          batchesUsed: [],
        },
      ],
      'name',
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.netQty)).toEqual([10, 5]);
  });

  it('combines stock for the same external item name and uses weighted average unit cost', () => {
    const rows = aggregatePeriodConsumption(
      [
        {
          type: 'STOCK_OUT',
          quantity: 10,
          materialId: 'mat-a',
          material: { name: 'Sand Lot A', externalItemName: 'QB-SAND-01', unit: 'bag' },
          totalCost: 200,
          batchesUsed: [],
        },
        {
          type: 'STOCK_OUT',
          quantity: 5,
          materialId: 'mat-b',
          material: { name: 'Sand Lot B', externalItemName: 'QB-SAND-01', unit: 'bag' },
          totalCost: 175,
          batchesUsed: [],
        },
        {
          type: 'RETURN',
          quantity: 2,
          materialId: 'mat-a',
          material: { name: 'Sand Lot A', externalItemName: 'QB-SAND-01', unit: 'bag' },
          totalCost: 50,
          batchesUsed: [],
        },
      ],
      'external',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      materialLabel: 'QB-SAND-01',
      netQty: 13,
      netCost: 325,
      unitCost: 25,
    });
  });
});
