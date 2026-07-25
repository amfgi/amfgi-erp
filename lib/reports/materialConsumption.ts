import * as XLSX from 'xlsx';
import type { PrismaClient } from '@prisma/client';

import { parseReportDateBounds } from '@/lib/reports/dateRangePresets';
import {
  aggregatePeriodConsumption,
  type MaterialLabelMode,
  type MonthlyJobConsumptionRow,
} from '@/lib/reports/monthlyJobSummary';

export type MaterialConsumptionOptions = {
  companyId: string;
  from?: string | null;
  to?: string | null;
  materialLabel: MaterialLabelMode;
};

export type MaterialConsumptionRow = MonthlyJobConsumptionRow;

export type MaterialConsumptionReport = {
  from: string | null;
  to: string | null;
  dateRangeLabel: string;
  materialLabel: MaterialLabelMode;
  rows: MaterialConsumptionRow[];
  totals: {
    materialCount: number;
    netQty: number;
    netCost: number;
  };
};

function buildDateFilter(start: Date | null, end: Date | null) {
  if (!start && !end) return undefined;
  const filter: { gte?: Date; lte?: Date } = {};
  if (start) filter.gte = start;
  if (end) filter.lte = end;
  return filter;
}

function money(value: number | null | undefined) {
  if (value == null) return '';
  return Math.round(value * 100) / 100;
}

function qty(value: number) {
  return Math.round(value * 1000) / 1000;
}

function hasNonZeroNetQty(netQty: number) {
  return Math.abs(netQty) > 0.0005;
}

export async function getMaterialConsumptionReport(
  db: PrismaClient,
  options: MaterialConsumptionOptions,
): Promise<MaterialConsumptionReport> {
  const { start, end, label } = parseReportDateBounds(options.from, options.to);
  const dateFilter = buildDateFilter(start, end);

  const transactions = await db.transaction.findMany({
    where: {
      companyId: options.companyId,
      type: { in: ['STOCK_OUT', 'RETURN'] },
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    select: {
      type: true,
      quantity: true,
      totalCost: true,
      materialId: true,
      material: {
        select: {
          name: true,
          externalItemName: true,
          unit: true,
        },
      },
      batchesUsed: {
        select: { costAmount: true },
      },
    },
  });

  const rows = aggregatePeriodConsumption(transactions, options.materialLabel).filter((row) =>
    hasNonZeroNetQty(row.netQty),
  );

  const totals = rows.reduce(
    (acc, row) => {
      acc.netQty += row.netQty;
      acc.netCost += row.netCost;
      return acc;
    },
    { materialCount: rows.length, netQty: 0, netCost: 0 },
  );

  return {
    from: options.from?.trim() || null,
    to: options.to?.trim() || null,
    dateRangeLabel: label,
    materialLabel: options.materialLabel,
    rows,
    totals,
  };
}

export function buildMaterialConsumptionWorkbook(report: MaterialConsumptionReport) {
  const workbook = XLSX.utils.book_new();
  const sheetRows: Array<Array<string | number>> = [
    ['Material consumption (material-wise)'],
    ['Date range', report.dateRangeLabel],
    [
      'Material label',
      report.materialLabel === 'external' ? 'External name (fallback to material name)' : 'Material name',
    ],
    [],
    ['Material', 'Unit', 'Net Qty', 'Unit Cost', 'Net Cost'],
  ];

  if (report.rows.length === 0) {
    sheetRows.push(['No consumption in this period']);
  } else {
    for (const row of report.rows) {
      sheetRows.push([
        row.materialLabel,
        row.unit,
        qty(row.netQty),
        row.unitCost == null ? '' : money(row.unitCost),
        money(row.netCost),
      ]);
    }
    sheetRows.push([]);
    sheetRows.push(['Totals', '', qty(report.totals.netQty), '', money(report.totals.netCost)]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  sheet['!cols'] = [{ wch: 36 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Consumption');
  return workbook;
}

export function materialConsumptionFilename(from: string | null, to: string | null) {
  if (!from && !to) return 'material-consumption-all-dates.xlsx';
  return `material-consumption-${from || 'start'}-${to || 'end'}.xlsx`;
}
