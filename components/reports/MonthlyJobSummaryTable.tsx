'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import type { MonthlyJobSheet } from '@/lib/reports/monthlyJobSummary';

type IncludeOptions = {
  consumption: boolean;
  production: boolean;
  costing: boolean;
  workHours: boolean;
};

function formatMoney(value: number | null | undefined) {
  if (value == null) return '—';
  return value.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function activityLabel(activity: MonthlyJobSheet['activity']) {
  const labels: string[] = [];
  if (activity.hasStockTransactions) labels.push('Stock');
  if (activity.hasWorkAssignment) labels.push('Work assignment');
  return labels.join(' + ') || '—';
}

export default function MonthlyJobSummaryTable({
  dateRangeLabel,
  groupBy,
  sheets,
  include,
  onDownload,
  downloading,
}: {
  dateRangeLabel: string;
  groupBy: 'parent' | 'variation';
  sheets: MonthlyJobSheet[];
  include: IncludeOptions;
  onDownload: () => void;
  downloading: boolean;
}) {
  if (sheets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
        No jobs with stock transactions or work assignments found for {dateRangeLabel}.
      </div>
    );
  }

  const groupLabel = groupBy === 'parent' ? 'parent job' : 'variation job';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {sheets.length} {groupLabel}
          {sheets.length === 1 ? '' : 's'} with activity in {dateRangeLabel}. Excel export includes a Summary index sheet
          plus one sheet per {groupLabel}, linked by job number.
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
                  Job #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Activity in month
                </th>
                {include.consumption ? (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Materials
                  </th>
                ) : null}
                {include.costing ? (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Period net cost
                  </th>
                ) : null}
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total cost till now
                </th>
                {include.production ? (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Production lines
                  </th>
                ) : null}
                {include.workHours ? (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Period work hours
                  </th>
                ) : null}
                {include.workHours ? (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Work hours till now
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {sheets.map((sheet) => (
                <tr key={sheet.jobId} className="border-b border-border transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/customers/jobs/${sheet.jobId}`}
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {sheet.jobNumber}
                    </Link>
                    {sheet.parentJobNumber ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">Parent {sheet.parentJobNumber}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <div>{sheet.customerName || '—'}</div>
                    {sheet.site ? <div className="mt-0.5 text-xs text-muted-foreground">{sheet.site}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-[10px] font-medium uppercase tracking-wide">
                      {activityLabel(sheet.activity)}
                    </Badge>
                  </td>
                  {include.consumption ? (
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{sheet.consumption.length}</td>
                  ) : null}
                  {include.costing ? (
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {sheet.costing ? formatMoney(sheet.costing.periodNetMaterialCost) : '—'}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatMoney(sheet.totalNetMaterialCostTillNow)}
                  </td>
                  {include.production ? (
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{sheet.production.length}</td>
                  ) : null}
                  {include.workHours ? (
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {sheet.workHoursTotal.workedHours}
                      {sheet.workHoursTotal.overtimeHours > 0
                        ? ` (+${sheet.workHoursTotal.overtimeHours} OT)`
                        : ''}
                    </td>
                  ) : null}
                  {include.workHours ? (
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {sheet.workHoursTotalTillNow.workedHours}
                      {sheet.workHoursTotalTillNow.overtimeHours > 0
                        ? ` (+${sheet.workHoursTotalTillNow.overtimeHours} OT)`
                        : ''}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
