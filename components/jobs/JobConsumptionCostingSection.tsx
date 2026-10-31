'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import { Button } from '@/components/ui/shadcn/button';
import Spinner from '@/components/ui/Spinner';
import toast from 'react-hot-toast';
import { useCalculateJobCostEngineMutation, useGetJobsQuery } from '@/store/hooks';

interface ConsumptionTxn {
  type: string;
  quantity: number;
  date: string;
  cost: number;
}

interface MaterialConsumption {
  materialId: string;
  materialName: string;
  unit: string;
  totalQuantity: number;
  totalCost: number;
  dispatchByDate?: Record<string, DispatchDay>;
  transactions?: ConsumptionTxn[];
}

interface CostingData {
  job: {
    id: string;
    jobNumber: string;
    description: string;
    status: string;
    isParent: boolean;
    parentJobId: string | null;
    customer: string;
  };
  consumption: MaterialConsumption[];
  totalCost: number;
  costingMethod: string;
  relatedJobs: Array<{ id: string; jobNumber: string; description: string }>;
  jobsIncluded: string[];
}

type UICostingMethod = 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT_PRICE';

type DispatchDay = { qty: number; cost: number };

type BudgetActualRow = {
  materialId: string;
  materialName: string;
  unit: string;
  budgetQty: number;
  budgetCost: number;
  actualQty: number;
  actualCost: number;
  dispatchByDate: Record<string, DispatchDay>;
};

const PRICING_MODE_BY_UI: Record<UICostingMethod, 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT'> = {
  FIFO: 'FIFO',
  MOVING_AVERAGE: 'MOVING_AVERAGE',
  CURRENT_PRICE: 'CURRENT',
};

function formatAed(value: number) {
  return `AED ${value.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQty(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function variancePercent(actual: number, budget: number) {
  if (budget === 0) {
    return actual === 0 ? 0 : 100;
  }
  return ((actual - budget) / Math.abs(budget)) * 100;
}

function varianceTone(value: number) {
  if (Math.abs(value) < 0.005) return 'text-slate-600 dark:text-slate-300';
  return value > 0
    ? 'text-rose-600 dark:text-rose-300'
    : 'text-emerald-700 dark:text-emerald-300';
}

function dispatchDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDispatchDate(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

function dateColumnHeading(key: string) {
  if (!key) return '';
  return formatDispatchDate(key);
}

function dispatchDaysFrom(consumption: MaterialConsumption) {
  const provided = consumption.dispatchByDate;
  if (provided && Object.keys(provided).length > 0) {
    const days: Record<string, DispatchDay> = {};
    for (const [key, day] of Object.entries(provided)) {
      const qty = Number(day?.qty);
      const cost = Number(day?.cost);
      if (!key || !Number.isFinite(qty) || !Number.isFinite(cost)) continue;
      days[key] = { qty, cost };
    }
    if (Object.keys(days).length > 0) return days;
  }
  const days: Record<string, DispatchDay> = {};
  for (const txn of consumption.transactions ?? []) {
    const key = dispatchDateKey(String(txn.date ?? ''));
    if (!key) continue;
    const sign = txn.type === 'STOCK_OUT' ? 1 : -1;
    const current = days[key] ?? { qty: 0, cost: 0 };
    current.qty += sign * (Number(txn.quantity) || 0);
    current.cost += sign * (Number(txn.cost) || 0);
    days[key] = current;
  }
  return days;
}

function formatDispatchCell(day: DispatchDay | undefined) {
  if (!day) return '';
  return formatAed(day.cost);
}

function actualQtyTone(actual: number, budget: number, showBudget: boolean) {
  if (!showBudget || Math.abs(actual - budget) < 0.0005) return 'text-slate-700 dark:text-slate-300';
  return actual < budget
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-rose-600 dark:text-rose-300';
}

function actualQtyExcelColor(actual: number, budget: number, showBudget: boolean) {
  if (!showBudget || Math.abs(actual - budget) < 0.0005) return '334155';
  return actual < budget ? '047857' : 'E11D48';
}

interface JobConsumptionCostingSectionProps {
  jobId: string;
  /** Optional list of parent + variation job ids to scope consumption to. If omitted, the API default applies (parent + all variations). */
  selectedJobIds?: string[];
  /** Total number of selectable jobs (parent + variations). Used to display the "filtered" notice. */
  totalSelectableJobCount?: number;
}

export default function JobConsumptionCostingSection({
  jobId,
  selectedJobIds,
  totalSelectableJobCount,
}: JobConsumptionCostingSectionProps) {
  const { data: jobs = [] } = useGetJobsQuery();
  const [calculateCostEngine, costEngineState] = useCalculateJobCostEngineMutation();

  const [loading, setLoading] = useState(true);
  const [costingMethod, setCostingMethod] = useState<UICostingMethod>('FIFO');
  const [data, setData] = useState<CostingData | null>(null);
  const [budgetByMaterial, setBudgetByMaterial] = useState<Map<string, { qty: number; cost: number; name: string; unit: string }>>(new Map());
  const [budgetTotalsRaw, setBudgetTotalsRaw] = useState<{ totalQuotedMaterialCost: number } | null>(null);
  const [budgetUnavailableReason, setBudgetUnavailableReason] = useState<string | null>(null);

  const currentJob = jobs.find((j) => j.id === jobId);
  const isParentJob = Boolean(currentJob && !currentJob.parentJobId);

  const selectedKey = useMemo(
    () => (selectedJobIds && selectedJobIds.length > 0 ? [...selectedJobIds].sort().join(',') : ''),
    [selectedJobIds],
  );

  const fetchConsumption = useCallback(async () => {
    if (!jobId) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({ method: costingMethod });
      if (isParentJob && selectedJobIds && selectedJobIds.length > 0) {
        selectedJobIds.forEach((id) => params.append('variationIds', id));
      }

      const res = await fetch(`/api/jobs/${jobId}/consumption-costing?${params}`, { cache: 'no-store' });
      const response = await res.json();

      if (res.ok && response.data) {
        setData(response.data);
      } else {
        const errorMsg = ((response as Record<string, unknown>)?.error as string) ?? 'Failed to fetch consumption data';
        toast.error(errorMsg);
      }
    } catch {
      toast.error('Error loading consumption data');
    } finally {
      setLoading(false);
    }
    // selectedKey is part of the dep list to re-fetch when filter changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, costingMethod, isParentJob, selectedKey]);

  const fetchBudget = useCallback(async () => {
    if (!jobId) return;
    setBudgetUnavailableReason(null);
    try {
      const result = await calculateCostEngine({
        jobId,
        pricingMode: PRICING_MODE_BY_UI[costingMethod],
      }).unwrap();

      const map = new Map<string, { qty: number; cost: number; name: string; unit: string }>();
      for (const item of result.items) {
        for (const m of item.materials) {
          const cur = map.get(m.materialId) ?? { qty: 0, cost: 0, name: m.materialName, unit: m.baseUnit };
          cur.qty += m.estimatedBaseQuantity;
          cur.cost += m.quotedCost;
          cur.name = m.materialName || cur.name;
          cur.unit = m.baseUnit || cur.unit;
          map.set(m.materialId, cur);
        }
      }
      setBudgetByMaterial(map);
      setBudgetTotalsRaw({ totalQuotedMaterialCost: result.summary.totalQuotedMaterialCost });
    } catch (err: unknown) {
      const message =
        (typeof err === 'object' && err && 'data' in err && typeof (err as { data?: { error?: unknown } }).data?.error === 'string'
          ? ((err as { data: { error: string } }).data.error)
          : null) ??
        (err instanceof Error ? err.message : 'Unable to compute budget');

      setBudgetByMaterial(new Map());
      setBudgetTotalsRaw(null);
      if (message === 'No active job items found for this contract') {
        setBudgetUnavailableReason('No budget items defined yet. Configure the job budget to see budget vs consumption.');
      } else if (message === 'Forbidden') {
        setBudgetUnavailableReason('You do not have permission to view the job budget.');
      } else {
        setBudgetUnavailableReason(message);
      }
    }
  }, [calculateCostEngine, jobId, costingMethod]);

  useEffect(() => {
    fetchConsumption();
  }, [fetchConsumption]);

  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  const rows = useMemo<BudgetActualRow[]>(() => {
    const merged = new Map<string, BudgetActualRow>();
    for (const [materialId, b] of budgetByMaterial.entries()) {
      merged.set(materialId, {
        materialId,
        materialName: b.name,
        unit: b.unit,
        budgetQty: b.qty,
        budgetCost: b.cost,
        actualQty: 0,
        actualCost: 0,
        dispatchByDate: {},
      });
    }
    if (data) {
      for (const c of data.consumption) {
        const cur = merged.get(c.materialId) ?? {
          materialId: c.materialId,
          materialName: c.materialName,
          unit: c.unit,
          budgetQty: 0,
          budgetCost: 0,
          actualQty: 0,
          actualCost: 0,
          dispatchByDate: {},
        };
        cur.actualQty = c.totalQuantity;
        cur.actualCost = c.totalCost;
        cur.dispatchByDate = dispatchDaysFrom(c);
        if (!cur.materialName) cur.materialName = c.materialName;
        if (!cur.unit) cur.unit = c.unit;
        merged.set(c.materialId, cur);
      }
    }
    return Array.from(merged.values()).sort((a, b) => a.materialName.localeCompare(b.materialName));
  }, [budgetByMaterial, data]);

  const totals = useMemo(() => {
    const totalBudget = budgetTotalsRaw?.totalQuotedMaterialCost ?? rows.reduce((sum, r) => sum + r.budgetCost, 0);
    const totalActual = data?.totalCost ?? rows.reduce((sum, r) => sum + r.actualCost, 0);
    const totalVariance = totalActual - totalBudget;
    const totalVariancePct = variancePercent(totalActual, totalBudget);
    const consumptionPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
    return { totalBudget, totalActual, totalVariance, totalVariancePct, consumptionPct };
  }, [budgetTotalsRaw, data, rows]);

  const dateColumns = useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row.dispatchByDate)) keys.add(key);
    }
    return Array.from(keys).sort();
  }, [rows]);

  const dateTotals = useMemo(() => {
    const byDate: Record<string, number> = {};
    for (const key of dateColumns) byDate[key] = 0;
    for (const row of rows) {
      for (const key of dateColumns) byDate[key] += row.dispatchByDate[key]?.cost ?? 0;
    }
    const totalValue = dateColumns.reduce((sum, key) => sum + (byDate[key] ?? 0), 0);
    return { byDate, totalValue };
  }, [dateColumns, rows]);

  const shownDateKeys = dateColumns.length > 0 ? dateColumns : [''];
  const showBudgetColumns = !budgetUnavailableReason;
  const isFiltered =
    isParentJob &&
    Boolean(selectedJobIds) &&
    typeof totalSelectableJobCount === 'number' &&
    totalSelectableJobCount > 0 &&
    (selectedJobIds?.length ?? 0) < totalSelectableJobCount;
  const isInitialLoading = loading || costEngineState.isLoading;

  const handleExportExcel = () => {
    if (!data) return;
    const headers = [
      'Material',
      'Unit',
      ...shownDateKeys.map(dateColumnHeading),
      ...(showBudgetColumns ? ['Budget Qty', 'Actual Qty', 'Qty Variance', 'Budget Cost'] : ['Actual Qty']),
      'Actual Cost',
      ...(showBudgetColumns ? ['Cost Variance'] : []),
    ];
    const actualQtyIndex = 2 + shownDateKeys.length + (showBudgetColumns ? 1 : 0);
    const body = rows.map((row) => {
      const qtyVar = row.actualQty - row.budgetQty;
      const costVar = row.actualCost - row.budgetCost;
      return [
        row.materialName,
        row.unit,
        ...shownDateKeys.map((key) => (key ? formatDispatchCell(row.dispatchByDate[key]) : '')),
        ...(showBudgetColumns ? [row.budgetQty, row.actualQty, qtyVar, row.budgetCost] : [row.actualQty]),
        row.actualCost,
        ...(showBudgetColumns ? [costVar] : []),
      ];
    });
    const blankLead = Array<string>(1 + shownDateKeys.length + (showBudgetColumns ? 3 : 1)).fill('');
    const totalsRow: Array<string | number> = [
      'Totals',
      ...blankLead,
      ...(showBudgetColumns ? [totals.totalBudget] : []),
      totals.totalActual,
      ...(showBudgetColumns ? [totals.totalVariance] : []),
    ];
    const valueLead = ['Total value', ''];
    const valueDates = shownDateKeys.map((key) => (key ? dateTotals.byDate[key] ?? 0 : ''));
    const valueTail = Array<string>(headers.length - valueLead.length - valueDates.length - 1).fill('');
    const totalValueRow: Array<string | number> = [...valueLead, ...valueDates, dateTotals.totalValue, ...valueTail];
    const sheetRows: Array<Array<string | number>> = [
      ['Budget vs Consumption Report'],
      ['Job Number', data.job.jobNumber, 'Customer', data.job.customer ?? '', 'Method', costingMethod],
      ['Description', data.job.description, 'Generated', new Date().toLocaleString()],
      [],
      headers,
      ...body,
      totalsRow,
      totalValueRow,
    ];
    const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
    const lastCol = Math.max(headers.length - 1, 5);
    sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }];
    sheet['!cols'] = headers.map((header, index) => ({
      wch: index === 0 ? 28 : index < 2 + shownDateKeys.length ? 16 : Math.max(12, header.length + 1),
    }));
    const headerRow = 4;
    const border = {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } },
    };
    for (let col = 0; col < headers.length; col += 1) {
      const headerCell = sheet[XLSX.utils.encode_cell({ r: headerRow, c: col })];
      if (headerCell) {
        headerCell.s = {
          font: { name: 'Calibri', bold: true, sz: 10, color: { rgb: '0F172A' } },
          fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
          alignment: { horizontal: col < 2 ? 'left' : 'right', vertical: 'center' },
          border,
        };
      }
    }
    rows.forEach((row, index) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRow + 1 + index, c: actualQtyIndex })];
      if (!cell) return;
      cell.s = {
        font: { name: 'Calibri', color: { rgb: actualQtyExcelColor(row.actualQty, row.budgetQty, showBudgetColumns) } },
        alignment: { horizontal: 'right' },
        border,
      };
    });
    const paintFooter = (rowIndex: number, fill: string) => {
      for (let col = 0; col < headers.length; col += 1) {
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: col });
        if (!sheet[address]) sheet[address] = { t: 's', v: '' };
        sheet[address].s = {
          font: { name: 'Calibri', bold: true, sz: 10, color: { rgb: '0F172A' } },
          fill: { patternType: 'solid', fgColor: { rgb: fill } },
          border,
        };
      }
    };
    const totalsExcelRow = headerRow + 1 + rows.length;
    paintFooter(totalsExcelRow, 'ECFDF5');
    paintFooter(totalsExcelRow + 1, 'F0F9FF');
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Budget vs consumption');
    const raw = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const blob = new Blob([raw], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `budget-vs-consumption-${data.job.jobNumber}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported to Excel');
  };

  const handlePrint = () => {
    const printContent = document.getElementById('job-consumption-print-content');
    if (!printContent) return;

    const printWindow = window.open('', '', 'height=600,width=900');
    if (!printWindow) {
      toast.error('Please enable popups to print');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Budget vs Consumption - ${data?.job.jobNumber ?? ''}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: white; color: #333; }
            .container { max-width: 1024px; margin: 0 auto; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f5f5f5; padding: 10px; text-align: left; font-weight: bold; border-bottom: 2px solid #333; font-size: 12px; }
            td { padding: 8px 10px; border-bottom: 1px solid #ddd; font-size: 12px; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .num { text-align: right; font-variant-numeric: tabular-nums; }
            .total-row { background-color: #ecfdf5; font-weight: bold; }
            .value-row { background-color: #f0f9ff; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">${printContent.innerHTML}</div>
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">
            Budget vs consumption
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Quoted budget versus actual stock-out costing per material. Switch the costing method to revalue actuals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" type="button" onClick={handlePrint} disabled={!data}>
            Print
          </Button>
          <Button type="button" onClick={handleExportExcel} disabled={!data}>
            Export Excel
          </Button>
        </div>
      </div>

      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="min-w-0 flex-1">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
            Costing method
          </label>
          <div className="flex flex-wrap gap-2">
            {(['FIFO', 'MOVING_AVERAGE', 'CURRENT_PRICE'] as const).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setCostingMethod(method)}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                  costingMethod === method
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {method === 'FIFO' && 'FIFO'}
                {method === 'MOVING_AVERAGE' && 'Moving average'}
                {method === 'CURRENT_PRICE' && 'Current price'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isInitialLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : null}

      {!isInitialLoading && (data || rows.length > 0) ? (
        <div id="job-consumption-print-content" className="px-5 py-6">
          {budgetUnavailableReason ? (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <span className="font-semibold">Budget data unavailable.</span> {budgetUnavailableReason} Showing actual consumption only.
            </div>
          ) : null}

          {isFiltered ? (
            <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
              Consumption is filtered to {selectedJobIds?.length ?? 0} of {totalSelectableJobCount ?? 0} jobs (parent + variations). Budget shown is the parent contract&apos;s full budget.
            </div>
          ) : null}

          <div className={`mb-6 grid gap-3 ${showBudgetColumns ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2'}`}>
            {showBudgetColumns ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">Budget (quoted)</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">{formatAed(totals.totalBudget)}</p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">Actual consumption</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatAed(totals.totalActual)}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {costingMethod === 'FIFO' && 'FIFO (first in first out)'}
                {costingMethod === 'MOVING_AVERAGE' && 'Moving average'}
                {costingMethod === 'CURRENT_PRICE' && 'Current price'}
              </p>
            </div>

            {showBudgetColumns ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">Variance</p>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${varianceTone(totals.totalVariance)}`}>
                    {totals.totalVariance >= 0 ? '+' : ''}{formatAed(totals.totalVariance)}
                  </p>
                  <p className={`mt-1 text-[11px] tabular-nums ${varianceTone(totals.totalVariance)}`}>
                    {totals.totalVariancePct >= 0 ? '+' : ''}{totals.totalVariancePct.toFixed(1)}% vs budget
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">Budget consumed</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">
                    {totals.consumptionPct.toFixed(1)}%
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full ${totals.consumptionPct > 100 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, Math.max(0, totals.consumptionPct))}%` }}
                    />
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-auto text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/90 dark:text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Material</th>
                    <th className="w-px whitespace-nowrap px-1 py-1 text-left tracking-normal">Unit</th>
                    {shownDateKeys.map((key) => (
                      <th key={key || 'date'} className="w-px whitespace-nowrap px-1 py-1 text-right normal-case tracking-normal">
                        {dateColumnHeading(key)}
                      </th>
                    ))}
                    {showBudgetColumns ? <th className="num px-2 py-1.5 text-right">Budget qty</th> : null}
                    <th className="num px-2 py-1.5 text-right">Actual qty</th>
                    {showBudgetColumns ? <th className="num px-2 py-1.5 text-right">Qty variance</th> : null}
                    {showBudgetColumns ? <th className="num px-2 py-1.5 text-right">Budget cost</th> : null}
                    <th className="num px-2 py-1.5 text-right">Actual cost</th>
                    {showBudgetColumns ? <th className="num px-2 py-1.5 text-right">Cost variance</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const qtyVar = r.actualQty - r.budgetQty;
                    const costVar = r.actualCost - r.budgetCost;
                    const costVarPct = variancePercent(r.actualCost, r.budgetCost);
                    return (
                      <tr
                        key={r.materialId}
                        className={`border-t border-slate-200 dark:border-slate-800 ${idx % 2 === 0 ? 'bg-white dark:bg-slate-950/40' : 'bg-slate-50/80 dark:bg-slate-900/40'}`}
                      >
                        <td className="px-2 py-1.5 font-medium text-slate-950 dark:text-white">{r.materialName}</td>
                        <td className="w-px whitespace-nowrap px-1 py-1 text-slate-600 dark:text-slate-400">{r.unit}</td>
                        {shownDateKeys.map((key) => {
                          const day = key ? r.dispatchByDate[key] : undefined;
                          return (
                            <td key={key || 'date'} className="w-px whitespace-nowrap px-1 py-1 text-right text-[10px] tabular-nums leading-tight text-slate-700 dark:text-slate-300">
                              {day ? formatAed(day.cost) : null}
                            </td>
                          );
                        })}
                        {showBudgetColumns ? (
                          <td className="num px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatQty(r.budgetQty)}</td>
                        ) : null}
                        <td className={`num px-2 py-1.5 text-right tabular-nums ${actualQtyTone(r.actualQty, r.budgetQty, showBudgetColumns)}`}>{formatQty(r.actualQty)}</td>
                        {showBudgetColumns ? (
                          <td className={`num px-2 py-1.5 text-right tabular-nums ${varianceTone(qtyVar)}`}>
                            {qtyVar >= 0 ? '+' : ''}{formatQty(qtyVar)}
                          </td>
                        ) : null}
                        {showBudgetColumns ? (
                          <td className="num px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatAed(r.budgetCost)}</td>
                        ) : null}
                        <td className="num px-2 py-1.5 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatAed(r.actualCost)}</td>
                        {showBudgetColumns ? (
                          <td className={`num px-2 py-1.5 text-right tabular-nums ${varianceTone(costVar)}`}>
                            <div className="flex flex-col items-end">
                              <span>{costVar >= 0 ? '+' : ''}{formatAed(costVar)}</span>
                              <span className="text-[11px]">{costVarPct >= 0 ? '+' : ''}{costVarPct.toFixed(1)}%</span>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="total-row border-t border-emerald-200 bg-emerald-50 font-semibold text-slate-950 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-50">
                    <td className="px-2 py-1.5" colSpan={(showBudgetColumns ? 5 : 3) + shownDateKeys.length}>Totals</td>
                    {showBudgetColumns ? (
                      <td className="num px-2 py-1.5 text-right tabular-nums">{formatAed(totals.totalBudget)}</td>
                    ) : null}
                    <td className="num px-2 py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{formatAed(totals.totalActual)}</td>
                    {showBudgetColumns ? (
                      <td className={`num px-2 py-1.5 text-right tabular-nums ${varianceTone(totals.totalVariance)}`}>
                        {totals.totalVariance >= 0 ? '+' : ''}{formatAed(totals.totalVariance)}
                      </td>
                    ) : null}
                  </tr>
                  <tr className="value-row border-t border-sky-200 bg-sky-50 font-semibold text-slate-950 dark:border-sky-900 dark:bg-sky-950/35 dark:text-sky-50">
                    <td className="px-2 py-1.5" colSpan={2}>Total value</td>
                    {shownDateKeys.map((key) => (
                      <td key={key || 'date'} className="w-px whitespace-nowrap px-1 py-1 text-right text-[10px] tabular-nums">
                        {key ? formatAed(dateTotals.byDate[key] ?? 0) : ''}
                      </td>
                    ))}
                    <td
                      className="num px-2 py-1.5 text-right tabular-nums"
                      colSpan={showBudgetColumns ? 6 : 2}
                    >
                      {formatAed(dateTotals.totalValue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No budget or consumption recorded yet.</p>
          )}

          <p className="mt-6 text-center text-[11px] text-slate-400 dark:text-slate-600">Generated on {new Date().toLocaleString()}</p>
        </div>
      ) : null}

      {!isInitialLoading && !data && rows.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          No budget or consumption data available.
        </div>
      ) : null}
    </section>
  );
}
