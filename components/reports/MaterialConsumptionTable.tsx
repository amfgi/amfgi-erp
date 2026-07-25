'use client';

import { Button } from '@/components/ui/shadcn/button';
import type { MaterialConsumptionReport } from '@/lib/reports/materialConsumption';

function formatMoney(value: number | null | undefined) {
  if (value == null) return '—';
  return value.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export default function MaterialConsumptionTable({
  report,
  onDownload,
  downloading,
}: {
  report: MaterialConsumptionReport;
  onDownload: () => void;
  downloading: boolean;
}) {
  if (report.rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
        No material consumption found for {report.dateRangeLabel}.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {report.totals.materialCount} material
          {report.totals.materialCount === 1 ? '' : 's'} with net consumption in {report.dateRangeLabel}. Net cost{' '}
          <span className="font-medium tabular-nums text-foreground">{formatMoney(report.totals.netCost)}</span>.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onDownload} disabled={downloading}>
          {downloading ? 'Preparing…' : 'Download Excel'}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Material
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Unit
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Net Qty
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Unit Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Net Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.materialId} className="border-b border-border transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">{row.materialLabel}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.unit || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatQty(row.netQty)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatMoney(row.unitCost)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                    {formatMoney(row.netCost)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/40">
                <td className="px-4 py-3 text-sm font-semibold text-foreground" colSpan={2}>
                  Totals
                </td>
                <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-foreground">
                  {formatQty(report.totals.netQty)}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-foreground">
                  {formatMoney(report.totals.netCost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
