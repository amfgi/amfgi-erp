import * as XLSX from 'xlsx';

import { buildMonthlyJobSummaryWorkbook } from '@/lib/reports/monthlyJobSummary';

describe('monthly job summary workbook', () => {
  it('creates a Summary index sheet linked to each job sheet', () => {
    const workbook = buildMonthlyJobSummaryWorkbook({
      from: '2026-06-01',
      to: '2026-06-30',
      dateRangeLabel: '2026-06-01 to 2026-06-30',
      groupBy: 'variation',
      materialLabel: 'name',
      include: {
        consumption: true,
        production: false,
        costing: true,
        workHours: true,
      },
      sheets: [
        {
          jobId: 'job-1',
          jobNumber: 'JOB-100',
          customerName: 'Acme',
          site: 'Site A',
          parentJobNumber: null,
          status: 'ACTIVE',
          activity: { hasStockTransactions: true, hasWorkAssignment: false },
          consumption: [
            {
              materialId: 'mat-1',
              materialLabel: 'Cement',
              unit: 'bag',
              netQty: 10,
              unitCost: 25,
              netCost: 250,
            },
          ],
          production: [],
          costing: {
            jobWorkValue: 1000,
            lpoValue: null,
            budgetMaterialCost: 500,
            periodIssuedCost: 250,
            periodReturnedCost: 0,
            periodNetMaterialCost: 250,
            periodReconcileCost: 0,
            totalNetMaterialCostTillNow: 800,
          },
          workHours: [],
          workHoursTotal: { workedHours: 0, overtimeHours: 0 },
          totalNetMaterialCostTillNow: 800,
          workHoursTotalTillNow: { workedHours: 12, overtimeHours: 1 },
        },
      ],
    });

    expect(workbook.SheetNames[0]).toBe('Summary');
    expect(workbook.SheetNames[1]).toBe('JOB-100');

    const summarySheet = workbook.Sheets.Summary;
    const jobLinkCell = summarySheet.A7;
    expect(jobLinkCell?.v).toBe('JOB-100');
    expect(jobLinkCell?.f).toBe('=HYPERLINK("#JOB-100!A1","JOB-100")');
    expect(jobLinkCell?.l?.Target).toBe('#JOB-100!A1');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const xml = buffer.toString('utf8');
    expect(xml).toContain('HYPERLINK');
    expect(xml).toContain('JOB-100!A1');
  });

  it('omits consumption rows with zero net qty from job sheets', () => {
    const workbook = buildMonthlyJobSummaryWorkbook({
      from: '2026-06-01',
      to: '2026-06-30',
      dateRangeLabel: '2026-06-01 to 2026-06-30',
      groupBy: 'variation',
      materialLabel: 'name',
      include: {
        consumption: true,
        production: false,
        costing: false,
        workHours: false,
      },
      sheets: [
        {
          jobId: 'job-1',
          jobNumber: 'JOB-100',
          customerName: 'Acme',
          site: null,
          parentJobNumber: null,
          status: 'ACTIVE',
          activity: { hasStockTransactions: true, hasWorkAssignment: false },
          consumption: [
            {
              materialId: 'mat-1',
              materialLabel: 'Cement',
              unit: 'bag',
              netQty: 10,
              unitCost: 25,
              netCost: 250,
            },
            {
              materialId: 'mat-2',
              materialLabel: 'Returned Sand',
              unit: 'bag',
              netQty: 0,
              unitCost: null,
              netCost: 0,
            },
          ],
          production: [],
          costing: null,
          workHours: [],
          workHoursTotal: { workedHours: 0, overtimeHours: 0 },
          totalNetMaterialCostTillNow: 250,
          workHoursTotalTillNow: { workedHours: 0, overtimeHours: 0 },
        },
      ],
    });

    const jobSheetValues = Object.values(workbook.Sheets['JOB-100'] ?? {})
      .filter((cell): cell is XLSX.CellObject => typeof cell === 'object' && cell != null && 'v' in cell)
      .map((cell) => cell.v);

    expect(jobSheetValues).toContain('Cement');
    expect(jobSheetValues).not.toContain('Returned Sand');

    const summarySheetValues = Object.values(workbook.Sheets.Summary ?? {})
      .filter((cell): cell is XLSX.CellObject => typeof cell === 'object' && cell != null && 'v' in cell)
      .map((cell) => cell.v);

    expect(summarySheetValues).toContain(1);
    expect(summarySheetValues).not.toContain(2);
  });
});
