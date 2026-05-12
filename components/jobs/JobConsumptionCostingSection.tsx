'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import Spinner from '@/components/ui/Spinner';
import toast from 'react-hot-toast';
import { useCalculateJobCostEngineMutation, useGetJobsQuery } from '@/store/hooks';

interface MaterialConsumption {
  materialId: string;
  materialName: string;
  unit: string;
  totalQuantity: number;
  totalCost: number;
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

type BudgetActualRow = {
  materialId: string;
  materialName: string;
  unit: string;
  budgetQty: number;
  budgetCost: number;
  actualQty: number;
  actualCost: number;
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

      const res = await fetch(`/api/jobs/${jobId}/consumption-costing?${params}`);
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
        };
        cur.actualQty = c.totalQuantity;
        cur.actualCost = c.totalCost;
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
    const html = `
      <table border="1" cellpadding="10">
        <tr><td colspan="8" style="font-weight: bold; font-size: 16px;">Budget vs Consumption Report</td></tr>
        <tr>
          <td style="font-weight: bold;">Job Number</td><td>${data.job.jobNumber}</td>
          <td style="font-weight: bold;">Customer</td><td>${data.job.customer}</td>
          <td style="font-weight: bold;">Method</td>
          <td colspan="3">${costingMethod}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Description</td><td colspan="3">${data.job.description}</td>
          <td style="font-weight: bold;">Generated</td><td colspan="3">${new Date().toLocaleString()}</td>
        </tr>
        <tr style="background-color: #f0f0f0;">
          <td>Material</td><td>Unit</td>
          <td>Budget Qty</td><td>Actual Qty</td><td>Qty Variance</td>
          <td>Budget Cost</td><td>Actual Cost</td><td>Cost Variance</td>
        </tr>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${r.materialName}</td>
            <td>${r.unit}</td>
            <td>${r.budgetQty.toFixed(3)}</td>
            <td>${r.actualQty.toFixed(3)}</td>
            <td>${(r.actualQty - r.budgetQty).toFixed(3)}</td>
            <td>AED ${r.budgetCost.toFixed(2)}</td>
            <td>AED ${r.actualCost.toFixed(2)}</td>
            <td>AED ${(r.actualCost - r.budgetCost).toFixed(2)}</td>
          </tr>
        `,
          )
          .join('')}
        <tr style="background-color: #e8f5e9; font-weight: bold;">
          <td colspan="5">Totals</td>
          <td>AED ${totals.totalBudget.toFixed(2)}</td>
          <td>AED ${totals.totalActual.toFixed(2)}</td>
          <td>AED ${totals.totalVariance.toFixed(2)}</td>
        </tr>
      </table>
    `;

    const element = document.createElement('a');
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    element.href = URL.createObjectURL(blob);
    element.download = `budget-vs-consumption-${data.job.jobNumber}-${Date.now()}.xls`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

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
            .total-row { background-color: #e8f5e9; font-weight: bold; border-top: 2px solid #333; }
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

  if (!currentJob) {
    return null;
  }

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
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900/90 dark:text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Material</th>
                    <th className="px-4 py-3 text-left">Unit</th>
                    {showBudgetColumns ? <th className="num px-4 py-3 text-right">Budget qty</th> : null}
                    <th className="num px-4 py-3 text-right">Actual qty</th>
                    {showBudgetColumns ? <th className="num px-4 py-3 text-right">Qty variance</th> : null}
                    {showBudgetColumns ? <th className="num px-4 py-3 text-right">Budget cost</th> : null}
                    <th className="num px-4 py-3 text-right">Actual cost</th>
                    {showBudgetColumns ? <th className="num px-4 py-3 text-right">Cost variance</th> : null}
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
                        <td className="px-4 py-3 font-medium text-slate-950 dark:text-white">{r.materialName}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.unit}</td>
                        {showBudgetColumns ? (
                          <td className="num px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatQty(r.budgetQty)}</td>
                        ) : null}
                        <td className="num px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatQty(r.actualQty)}</td>
                        {showBudgetColumns ? (
                          <td className={`num px-4 py-3 text-right tabular-nums ${varianceTone(qtyVar)}`}>
                            {qtyVar >= 0 ? '+' : ''}{formatQty(qtyVar)}
                          </td>
                        ) : null}
                        {showBudgetColumns ? (
                          <td className="num px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatAed(r.budgetCost)}</td>
                        ) : null}
                        <td className="num px-4 py-3 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatAed(r.actualCost)}</td>
                        {showBudgetColumns ? (
                          <td className={`num px-4 py-3 text-right tabular-nums ${varianceTone(costVar)}`}>
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
                  <tr className="total-row border-t-2 border-emerald-300 bg-emerald-50 font-semibold text-slate-950 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-white">
                    <td className="px-4 py-3" colSpan={showBudgetColumns ? 5 : 2}>Totals</td>
                    {showBudgetColumns ? (
                      <td className="num px-4 py-3 text-right tabular-nums">{formatAed(totals.totalBudget)}</td>
                    ) : null}
                    <td className="num px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{formatAed(totals.totalActual)}</td>
                    {showBudgetColumns ? (
                      <td className={`num px-4 py-3 text-right tabular-nums ${varianceTone(totals.totalVariance)}`}>
                        {totals.totalVariance >= 0 ? '+' : ''}{formatAed(totals.totalVariance)}
                      </td>
                    ) : null}
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
