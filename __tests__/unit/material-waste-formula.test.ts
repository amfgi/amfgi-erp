import { buildJobItemEstimate } from '@/lib/job-costing/formulaEngine';
import { resolveMaterialWastePercent } from '@/lib/job-costing/expressionEvaluator';
import type { FormulaConfig, JobItemSpecifications, MaterialPricingSnapshot } from '@/lib/job-costing/types';

describe('material waste percent formulas', () => {
  it('evaluates waste percent expressions', () => {
    expect(resolveMaterialWastePercent(5, {})).toBe(5);
    expect(resolveMaterialWastePercent('specs.global.waste_rate', { 'specs.global.waste_rate': 7 })).toBe(7);
    expect(resolveMaterialWastePercent('specs.global.base_waste * 2', { 'specs.global.base_waste': 3 })).toBe(6);
  });

  it('applies formula-based waste percent in job estimates', () => {
    const result = buildJobItemEstimate({
      jobId: 'job-1',
      jobNumber: 'JOB-1',
      postingDate: new Date('2026-01-01T00:00:00.000Z'),
      nonWorkingWeekdays: [],
      pricingMode: 'CURRENT',
      formulaLibrary: {
        id: 'formula-1',
        name: 'Formula',
        fabricationType: 'Test',
        formulaConfig: {
          version: 2,
          constants: [],
          areas: [
            {
              key: 'main',
              label: 'Main',
              variables: {},
              materials: [
                {
                  materialId: 'mat-1',
                  quantityExpression: 'area.sqm',
                  wastePercent: 'specs.global.waste_rate',
                },
              ],
              labor: [],
            },
          ],
        },
      },
      jobItem: {
        id: 'item-1',
        name: 'Budget item',
        specifications: {
          areas: { main: { measurements: { sqm: 10 } } },
          global: { waste_rate: 5 },
        },
        assignedEmployeeIds: [],
      },
      materialCatalog: new Map([['mat-1', { id: 'mat-1', name: 'Resin', unit: 'kg' }]]),
      materialPricing: new Map<string, MaterialPricingSnapshot>([
        ['mat-1', { materialId: 'mat-1', materialName: 'Resin', baseUnit: 'kg', baseUnitCost: 1, source: 'CURRENT' }],
      ]),
      materialFactorToBase: () => 1,
      actualConsumption: new Map(),
      teamProfiles: [],
    });

    expect(result.materials[0]?.estimatedBaseQuantity).toBe(10.5);
  });
});
