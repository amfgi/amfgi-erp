import * as XLSX from 'xlsx';

import { buildMaterialConsumptionWorkbook } from '@/lib/reports/materialConsumption';

describe('material consumption workbook', () => {
  it('writes material rows and totals', () => {
    const workbook = buildMaterialConsumptionWorkbook({
      from: '2026-07-01',
      to: '2026-07-31',
      dateRangeLabel: '2026-07-01 to 2026-07-31',
      materialLabel: 'name',
      rows: [
        {
          materialId: 'mat-1',
          materialLabel: 'Cement',
          unit: 'bag',
          netQty: 10,
          unitCost: 20,
          netCost: 200,
        },
      ],
      totals: {
        materialCount: 1,
        netQty: 10,
        netCost: 200,
      },
    });

    const sheet = workbook.Sheets.Consumption;
    expect(sheet).toBeDefined();
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    expect(rows.some((row) => row[0] === 'Cement' && row[2] === 10)).toBe(true);
    expect(rows.some((row) => row[0] === 'Totals' && row[4] === 200)).toBe(true);
  });
});
