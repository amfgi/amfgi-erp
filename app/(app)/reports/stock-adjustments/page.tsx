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
import { useGetStockAdjustmentsQuery } from '@/store/hooks';

function formatMoney(value: number | null) {
  if (value == null) return '-';
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatEvidenceType(value: string | null) {
  switch (value) {
    case 'PHYSICAL_COUNT':
      return 'Physical count';
    case 'DAMAGE_REPORT':
      return 'Damage report';
    case 'SUPPLIER_CLAIM':
      return 'Supplier claim';
    case 'CUSTOMER_RETURN':
      return 'Customer return';
    case 'OTHER':
      return 'Other';
    default:
      return value || '-';
  }
}

function AdjustmentStatusBadge({ status }: { status: 'PENDING' | 'APPROVED' | 'REJECTED' }) {
  const label = status.replace(/_/g, ' ');
  const cls =
    status === 'APPROVED'
      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
      : status === 'REJECTED'
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  return (
    <Badge variant="outline" className={cn('text-[10px] font-semibold uppercase tracking-wide', cls)}>
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
  tone?: 'neutral' | 'yellow' | 'emerald' | 'destructive';
}) {
  const shell =
    tone === 'destructive'
      ? 'border-destructive/35 bg-destructive/10'
      : tone === 'yellow'
        ? 'border-yellow-500/35 bg-yellow-500/10'
        : tone === 'emerald'
          ? 'border-emerald-500/35 bg-emerald-500/10'
          : 'border-border bg-muted/30';

  return (
    <div className={cn('rounded-lg border px-4 py-3', shell)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export default function StockAdjustmentsPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const { data, isFetching, isError, refetch } = useGetStockAdjustmentsQuery(undefined, {
    skip: !canView,
  });

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [evidenceType, setEvidenceType] = useState('all');

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (evidenceType !== 'all' && row.evidenceType !== evidenceType) return false;
      if (!query) return true;
      return [
        row.referenceNumber,
        row.reason,
        row.createdByName ?? '',
        row.decidedByName ?? '',
        row.evidenceReference ?? '',
        row.materialNames.join(' '),
        row.warehouseNames.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [evidenceType, rows, search, status]);

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Stock adjustments</CardTitle>
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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Stock adjustment report</h1>
          <p className="text-sm text-muted-foreground">
            Bulk manual adjustments grouped by request, with evidence, requester, approver, warehouse coverage, and
            quantity and value impact.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
          <p className="w-full text-right text-xs tabular-nums text-muted-foreground sm:w-auto sm:pl-2">
            {filteredRows.length} row{filteredRows.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <SummaryTile label="Requests" value={summary?.total ?? 0} />
        <SummaryTile label="Pending" value={summary?.pending ?? 0} tone="yellow" />
        <SummaryTile label="Approved" value={summary?.approved ?? 0} tone="emerald" />
        <SummaryTile label="Rejected" value={summary?.rejected ?? 0} tone="destructive" />
        <SummaryTile label="Add qty" value={formatQty(summary?.grossIncreaseQty ?? 0)} />
        <SummaryTile label="Remove qty" value={formatQty(summary?.grossDecreaseQty ?? 0)} />
        <SummaryTile label="Applied net value" value={formatMoney(summary?.appliedNetValue ?? 0)} />
      </div>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_200px_auto]">
          <div className="space-y-2">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</label>
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Reference, reason, requester, warehouse, material…"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</label>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Evidence</label>
            <Select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)}>
              <option value="all">All evidence</option>
              <option value="PHYSICAL_COUNT">Physical count</option>
              <option value="DAMAGE_REPORT">Damage report</option>
              <option value="SUPPLIER_CLAIM">Supplier claim</option>
              <option value="CUSTOMER_RETURN">Customer return</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
          <div className="flex items-end">
            <p className="text-xs text-muted-foreground">
              Estimated value uses the requested line cost. Applied value uses approved transactions only.
            </p>
          </div>
        </div>
      </section>

      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>Could not load the stock adjustment report. Try refresh.</AlertDescription>
        </Alert>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="min-w-[150px] px-3 py-3">Created</th>
                  <th className="min-w-[150px] px-3 py-3">Reference</th>
                  <th className="min-w-[110px] px-3 py-3">Status</th>
                  <th className="min-w-[180px] px-3 py-3">Evidence</th>
                  <th className="min-w-[220px] px-3 py-3">Reason</th>
                  <th className="min-w-[180px] px-3 py-3">Warehouse / Material</th>
                  <th className="min-w-[110px] px-3 py-3 text-right">Add qty</th>
                  <th className="min-w-[110px] px-3 py-3 text-right">Remove qty</th>
                  <th className="min-w-[110px] px-3 py-3 text-right">Net qty</th>
                  <th className="min-w-[130px] px-3 py-3 text-right">Estimated</th>
                  <th className="min-w-[130px] px-3 py-3 text-right">Applied</th>
                  <th className="min-w-[180px] px-3 py-3">Requester / Approver</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">
                      No rows match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border odd:bg-background even:bg-muted/20 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-3 py-2.5 text-foreground">
                        <div>{formatDateTime(row.createdAt)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.lineCount} lines</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-foreground">{row.referenceNumber}</td>
                      <td className="px-3 py-2.5">
                        <AdjustmentStatusBadge status={row.status} />
                      </td>
                      <td className="px-3 py-2.5 text-foreground">
                        <div>{formatEvidenceType(row.evidenceType)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.evidenceReference || '-'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-foreground">
                        <div>{row.reason}</div>
                        {row.decisionNote ? (
                          <div className="mt-1 text-xs text-muted-foreground">{row.decisionNote}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-foreground">
                        <div>{row.warehouseNames.join(', ') || '-'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.materialNames.join(', ') || '-'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatQty(row.grossIncreaseQty)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-700 dark:text-red-300">
                        {formatQty(row.grossDecreaseQty)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.netQty)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatMoney(row.estimatedNetValue)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatMoney(row.appliedNetValue)}
                      </td>
                      <td className="px-3 py-2.5 text-foreground">
                        <div>{row.createdByName || '-'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.decidedByName ? `${row.decidedByName} on ${formatDateTime(row.decidedAt)}` : 'Awaiting decision'}
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

      <p className="text-xs leading-relaxed text-muted-foreground">
        Use{' '}
        <Link href="/reports/stock-exceptions" className="font-medium text-primary underline-offset-4 hover:underline">
          stock exceptions
        </Link>{' '}
        for the wider exception trail and{' '}
        <Link href="/stock/manual-adjustments" className="font-medium text-primary underline-offset-4 hover:underline">
          bulk stock adjustments
        </Link>{' '}
        to request new adjustment batches.
      </p>
    </div>
  );
}
