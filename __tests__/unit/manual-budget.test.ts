import { buildManualJobItemEstimate } from '@/lib/job-costing/manualJobItemEstimate';
import { buildManualBudgetSpecifications } from '@/lib/job-costing/manualBudget';
import type { MaterialPricingSnapshot } from '@/lib/job-costing/types';

function estimateMaterialQuantity(specifications: ReturnType<typeof buildManualBudgetSpecifications>) {
  const result = buildManualJobItemEstimate({
    postingDate: new Date('2026-01-01T00:00:00.000Z'),
    nonWorkingWeekdays: [],
    pricingMode: 'CURRENT',
    jobItem: {
      id: 'item-1',
      name: 'Manual line',
      specifications,
      assignedEmployeeIds: [],
    },
    materialCatalog: new Map([['mat-1', { id: 'mat-1', name: 'Resin', unit: 'kg' }]]),
    materialPricing: new Map<string, MaterialPricingSnapshot>([
      ['mat-1', { materialId: 'mat-1', materialName: 'Resin', baseUnit: 'kg', baseUnitCost: 10, source: 'CURRENT' }],
    ]),
    materialFactorToBase: () => 1,
    actualConsumption: new Map(),
    teamProfiles: [],
  });

  return {
    materialQty: result.materials[0]?.estimatedBaseQuantity ?? 0,
    laborDays: result.labor[0]?.estimatedDays ?? 0,
    quotedCost: result.totalQuotedMaterialCost,
  };
}

describe('manual budget items', () => {
  it('sums manual material quantities with waste into costing', () => {
    const specs = buildManualBudgetSpecifications({
      materials: [{ id: 'm1', materialId: 'mat-1', quantity: 100, wastePercent: 10 }],
      labor: [],
    });
    const result = estimateMaterialQuantity(specs);
    expect(result.materialQty).toBeCloseTo(110, 5);
    expect(result.quotedCost).toBeCloseTo(1100, 5);
  });

  it('converts manual labor hours to estimated days', () => {
    const specs = buildManualBudgetSpecifications({
      materials: [],
      labor: [{ id: 'l1', expertiseName: 'Laminator', estimatedHours: 16, crewSize: 2 }],
    });
    const result = estimateMaterialQuantity(specs);
    expect(result.laborDays).toBe(1);
  });
});
