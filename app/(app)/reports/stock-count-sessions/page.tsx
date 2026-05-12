'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { cn } from '@/lib/utils';
import { useGetStockCountSessionsReportQuery } from '@/store/hooks';

function formatQty(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function SessionStatusBadge({ status, label }: { status: string; label: string }) {
  const cls =
    status === 'ADJUSTMENT_APPROVED'
      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
      : status === 'ADJUSTMENT_REJECTED'
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : status === 'ADJUSTMENT_PENDING'
          ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200'
          : status === 'CANCELLED'
            ? 'border-border bg-muted/50 text-muted-foreground'
            : 'border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200';
  return (
    <Badge variant="outline" className={cn('w-fit text-[10px] font-semibold uppercase tracking-wide', cls)}>
      {label}
    </Badge>
  );
}

function LinkedAdjustmentBadge({ status }: { status: string }) {
  const label = `Adjustment ${status}`;
  const cls =
    status === 'APPROVED'
      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
      : status === 'REJECTED'
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : status === 'PENDING'
          ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200'
          : 'border-border bg-muted/50 text-muted-foreground';
  return (
    <Badge variant="outline" className={cn('w-fit text-[10px] font-semibold uppercase tracking-wide', cls)}>
      {label}
    </Badge>
  );
}

function SummaryTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  tone?: 'neutral' | 'sky' | 'yellow' | 'emerald' | 'destructive';
}) {
  const shell =
    tone === 'destructive'
      ? 'border-destructive/35 bg-destructive/10'
      : tone === 'yellow'
        ? 'border-yellow-500/35 bg-yellow-500/10'
        : tone === 'emerald'
          ? 'border-emerald-500/35 bg-emerald-500/10'
          : tone === 'sky'
            ? 'border-sky-500/35 bg-sky-500/10'
            : 'border-border bg-muted/30';

  return (
    <div className={cn('rounded-lg border px-4 py-3', shell)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

const SESSION_TABLE_ROW =
  'border-b border-border odd:bg-background even:bg-muted/20 transition-colors hover:bg-muted/40';

export default function StockCountSessionsReportPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const { data, isFetching, isError, refetch } = useGetStockCountSessionsReportQuery(undefined, {
    skip: !canView,
  });

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [varianceOnly, setVarianceOnly] = useState(false);

  const rows = data?.rows ?? [];
  const warehouseRows = data?.warehouseRows ?? [];
  const materialRows = data?.materialRows ?? [];
  const summary = data?.summary;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (varianceOnly && row.varianceLineCount === 0) return false;
      if (!query) return true;

      return [
        row.title,
        row.warehouseName,
        row.statusLabel,
        row.evidenceReference ?? '',
        row.linkedAdjustmentReferenceNumber ?? '',
        row.createdByName ?? '',
        row.reviewedByName ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [rows, search, status, varianceOnly]);

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Stock count sessions</CardTitle>
            <CardDescription>You do not have permission to view this report.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reports</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Stock count session report</h1>
          <p className="text-sm text-muted-foreground">
            Review recount sessions, linked adjustment decisions, approval timing, and repeated variance patterns by
            material.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
          <p className="w-full text-right text-xs tabular-nums text-muted-foreground sm:w-auto sm:pl-2">
            {filteredRows.length} session{filteredRows.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
        <SummaryTile label="Sessions" value={summary?.totalSessions ?? 0} />
        <SummaryTile label="Drafts" value={summary?.draftCount ?? 0} tone="sky" />
        <SummaryTile label="Pending" value={summary?.pendingAdjustmentCount ?? 0} tone="yellow" />
        <SummaryTile label="Approved" value={summary?.approvedAdjustmentCount ?? 0} tone="emerald" />
        <SummaryTile label="Rejected" value={summary?.rejectedAdjustmentCount ?? 0} tone="destructive" />
        <SummaryTile label="Variance lines" value={summary?.totalVarianceLines ?? 0} />
        <SummaryTile label="Shortage qty" value={formatQty(summary?.grossShortageQty ?? 0)} />
        <SummaryTile
          label="Avg approval hrs"
          value={
            summary?.avgApprovalHours == null
              ? '-'
              : summary.avgApprovalHours.toLocaleString('en-US', { maximumFractionDigits: 2 })
          }
        />
      </div>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_auto_auto]">
          <div className="space-y-2">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</label>
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title, warehouse, evidence, requester…"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</label>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ADJUSTMENT_PENDING">Adjustment pending</option>
              <option value="ADJUSTMENT_APPROVED">Adjustment approved</option>
              <option value="ADJUSTMENT_REJECTED">Adjustment rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </div>
          <label className="flex cursor-pointer items-end gap-2 pb-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={varianceOnly}
              onChange={(event) => setVarianceOnly(event.target.checked)}
              className="size-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
            Variance only
          </label>
          <div className="flex items-end">
            <p className="text-xs text-muted-foreground">Estimated value uses the count-session line cost snapshot.</p>
          </div>
        </div>
      </section>

      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>Could not load the stock count session report. Try refresh.</AlertDescription>
        </Alert>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="min-w-[160px] px-3 py-3">Created</th>
                  <th className="min-w-[220px] px-3 py-3">Session</th>
                  <th className="min-w-[120px] px-3 py-3">Status</th>
                  <th className="min-w-[180px] px-3 py-3">Evidence / Adjustment</th>
                  <th className="min-w-[110px] px-3 py-3 text-right">Lines</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Excess qty</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Shortage qty</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Net qty</th>
                  <th className="min-w-[140px] px-3 py-3 text-right">Est. value</th>
                  <th className="min-w-[200px] px-3 py-3">Requester / Review</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                      No count sessions match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className={SESSION_TABLE_ROW}>
                      <td className="px-3 py-2.5 text-foreground">
                        <div>{formatDateTime(row.createdAt)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Updated {formatDateTime(row.updatedAt)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-foreground">
                        <div className="font-medium text-foreground">{row.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.warehouseName} | revision {row.currentRevision}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1.5">
                          <SessionStatusBadge status={row.status} label={row.statusLabel} />
                          {row.linkedAdjustmentStatus ? (
                            <LinkedAdjustmentBadge status={row.linkedAdjustmentStatus} />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-foreground">
                        <div>{row.evidenceReference || '-'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.linkedAdjustmentReferenceNumber || 'No linked adjustment'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        <div>{row.lineCount}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.varianceLineCount} variance</div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatQty(row.grossExcessQty)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-700 dark:text-red-300">
                        {formatQty(row.grossShortageQty)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.netVarianceQty)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatMoney(row.estimatedNetValue)}
                      </td>
                      <td className="px-3 py-2.5 text-foreground">
                        <div>{row.createdByName || '-'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.reviewedByName
                            ? `${row.reviewedByName} on ${formatDateTime(row.reviewedAt)}`
                            : 'Awaiting review'}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Approval hrs:{' '}
                          {row.approvalHours == null
                            ? '-'
                            : row.approvalHours.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-5">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Warehouse variance trend</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Which warehouses are driving recount volume, shortages, and approval lag.
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="min-w-[220px] px-3 py-3">Warehouse</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Sessions</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Variance</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Pending</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Approved</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Excess qty</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Shortage qty</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Net qty</th>
                  <th className="min-w-[140px] px-3 py-3 text-right">Est. value</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Avg hrs</th>
                  <th className="min-w-[160px] px-3 py-3">Latest session</th>
                </tr>
              </thead>
              <tbody>
                {warehouseRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                      No warehouse variance trends yet.
                    </td>
                  </tr>
                ) : (
                  warehouseRows.map((row) => (
                    <tr key={row.warehouseId} className={SESSION_TABLE_ROW}>
                      <td className="px-3 py-2.5 text-foreground">
                        <div className="font-medium text-foreground">{row.warehouseName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.draftCount} draft, {row.rejectedCount} rejected
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{row.totalSessions}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{row.varianceSessionCount}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-yellow-700 dark:text-yellow-300">
                        {row.pendingCount}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                        {row.approvedCount}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatQty(row.grossExcessQty)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-700 dark:text-red-300">
                        {formatQty(row.grossShortageQty)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.netVarianceQty)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatMoney(row.estimatedNetValue)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {row.avgApprovalHours == null
                          ? '-'
                          : row.avgApprovalHours.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-foreground">{formatDateTime(row.latestSessionAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-5">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Recurring variance materials</h2>
          <p className="mt-1 text-sm text-muted-foreground">Materials that appear most often in count-session variances.</p>
        </div>
        <div className="p-4 sm:p-5">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="min-w-[220px] px-3 py-3">Material</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Sessions</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Excess qty</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Shortage qty</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Net qty</th>
                  <th className="min-w-[140px] px-3 py-3 text-right">Est. value</th>
                  <th className="min-w-[160px] px-3 py-3">Latest session</th>
                </tr>
              </thead>
              <tbody>
                {materialRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No variance material patterns yet.
                    </td>
                  </tr>
                ) : (
                  materialRows.map((row) => (
                    <tr key={row.materialId} className={SESSION_TABLE_ROW}>
                      <td className="px-3 py-2.5 text-foreground">
                        <div className="font-medium text-foreground">{row.materialName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.unit}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{row.sessionCount}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatQty(row.grossExcessQty)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-700 dark:text-red-300">
                        {formatQty(row.grossShortageQty)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.netVarianceQty)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatMoney(row.estimatedNetValue)}
                      </td>
                      <td className="px-3 py-2.5 text-foreground">{formatDateTime(row.latestSessionAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Use{' '}
        <Link href="/stock/count-session" className="font-medium text-primary underline-offset-4 hover:underline">
          stock count sessions
        </Link>{' '}
        to continue recount work and{' '}
        <Link href="/reports/stock-adjustments" className="font-medium text-primary underline-offset-4 hover:underline">
          stock adjustments
        </Link>{' '}
        to review the resulting correction requests.
      </p>
    </div>
  );
}
