'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { useGetSupplierTraceabilityQuery } from '@/store/hooks';
import { cn } from '@/lib/utils';

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-GB');
}

function SummaryTile({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5',
        emphasize ? 'border-sky-500/35 bg-sky-500/10' : 'border-border bg-muted/30',
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums text-foreground sm:text-lg">{value}</p>
    </div>
  );
}

export default function SupplierTraceabilityPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const { data, isFetching, isError, refetch } = useGetSupplierTraceabilityQuery(undefined, {
    skip: !canView,
  });

  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState('all');

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (focus === 'open' && row.quantityAvailable <= 0.0005) return false;
      if (focus === 'dispatched' && row.dispatchCount <= 0) return false;
      if (focus === 'returned' && row.returnedQuantity <= 0.0005) return false;
      if (focus === 'unlinked_receipt' && row.receiptNumber) return false;
      if (!query) return true;

      const haystack = [
        row.supplierName,
        row.receiptNumber ?? '',
        row.batchNumber,
        row.materialName,
        row.warehouseName ?? '',
        row.jobs.map((job) => job.jobNumber).join(' '),
        row.customers.map((customer) => customer.name).join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [focus, rows, search]);

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Supplier traceability</CardTitle>
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
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Insights</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Supplier traceability</h1>
          <p className="text-sm text-muted-foreground">
            Follow each receipt batch from supplier and receipt number into warehouse stock, dispatch usage, linked
            jobs, and customer delivery flow.
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryTile label="Batches" value={summary?.totalBatches ?? 0} />
        <SummaryTile label="Suppliers" value={summary?.suppliersCovered ?? 0} />
        <SummaryTile label="Open batches" value={summary?.openBatches ?? 0} />
        <SummaryTile label="Dispatched" value={summary?.dispatchedBatchCount ?? 0} emphasize />
        <SummaryTile label="Receipt linked" value={summary?.receiptLinkedCount ?? 0} />
        <SummaryTile label="Returned" value={summary?.returnedBatchCount ?? 0} />
      </div>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="space-y-2">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Supplier, receipt, batch, material, job, customer…"
            />
          </div>
          <div className="space-y-2">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Focus</span>
            <Select value={focus} onChange={(event) => setFocus(event.target.value)}>
              <option value="all">All batches</option>
              <option value="open">Open stock only</option>
              <option value="dispatched">Dispatched only</option>
              <option value="returned">Returned only</option>
              <option value="unlinked_receipt">No receipt number</option>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          One row per batch. Jobs and customers are taken from the linked dispatch and return activity.
        </p>
      </section>

      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>Could not load the supplier traceability report. Try refresh.</AlertDescription>
        </Alert>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="sticky left-0 z-20 min-w-[280px] border-r border-border bg-muted/50 px-3 py-3 backdrop-blur-sm">
                    Supplier / Batch
                  </th>
                  <th className="min-w-[170px] px-3 py-3">Material</th>
                  <th className="min-w-[140px] px-3 py-3">Warehouse</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Received</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Available</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Net issued</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Receipt cost</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Issued cost</th>
                  <th className="min-w-[110px] px-3 py-3 text-right">Dispatches</th>
                  <th className="min-w-[220px] px-3 py-3">Jobs</th>
                  <th className="min-w-[220px] px-3 py-3">Customers</th>
                  <th className="min-w-[110px] px-3 py-3">Last activity</th>
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
                      key={row.batchId}
                      className="border-b border-border odd:bg-background even:bg-muted/20 transition-colors hover:bg-muted/40"
                    >
                      <td className="sticky left-0 z-10 border-r border-border bg-inherit px-3 py-2.5 align-top backdrop-blur-sm">
                        <p className="font-medium text-foreground">{row.supplierName}</p>
                        <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                          <p>
                            Batch:{' '}
                            <Link
                              href="/stock/stock-batches"
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {row.batchNumber}
                            </Link>
                          </p>
                          <p>Receipt: {row.receiptNumber || 'No receipt number'}</p>
                          <p>Received: {formatDate(row.receivedDate)}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <p className="font-medium text-foreground">{row.materialName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{row.unit}</p>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.warehouseName || '-'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.quantityReceived)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.quantityAvailable)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.netIssuedQuantity)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatMoney(row.receiptCost)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatMoney(row.issuedCost - row.returnedCost)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {row.dispatchCount}
                        <span className="ml-1 text-xs text-muted-foreground/80">DN {row.deliveryNoteCount}</span>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {row.jobs.length === 0 ? (
                          <span className="text-muted-foreground/80">No dispatch links</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {row.jobs.map((job) => (
                              <Link
                                key={job.id}
                                href={`/customers/jobs/${job.id}`}
                                className="rounded-full border border-sky-500/35 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200"
                              >
                                {job.jobNumber}
                              </Link>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {row.customers.length === 0 ? (
                          <span className="text-muted-foreground/80">No customer links</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {row.customers.map((customer) => (
                              <span
                                key={customer.id}
                                className="rounded-full border border-border bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                {customer.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{formatDate(row.lastActivityDate)}</td>
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
        <Link href="/reports/job-profitability" className="font-medium text-primary underline-offset-4 hover:underline">
          customer and job profitability
        </Link>{' '}
        to evaluate the cost impact after tracing the batch path.
      </p>
    </div>
  );
}
