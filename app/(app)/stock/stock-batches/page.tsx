'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Input } from '@/components/ui/shadcn/input';
import { buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import DataTable from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { cn } from '@/lib/utils';
import { DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination/serverList';
import { useGetStockBatchesPageQuery, STOCK_BATCH_PAGE_SIZE_OPTIONS } from '@/store/hooks';
import type { StockBatch } from '@/store/api/endpoints/stockBatches';

function formatMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function ratio(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function SectionShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export default function StockBatchesPage() {
  const { data: session } = useSession();
  const [todayMs] = useState(() => Date.now());
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView =
    isSA ||
    perms.includes('material.view') ||
    perms.includes('transaction.stock_in') ||
    perms.includes('transaction.stock_out');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);

  const { data: batchesPage, isFetching } = useGetStockBatchesPageQuery(
    {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      search: deferredSearch,
    },
    {
      skip: !canView,
      refetchOnMountOrArgChange: 30,
    },
  );
  const batches = batchesPage?.items ?? [];
  const totalBatches = batchesPage?.total ?? 0;

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, pageSize]);

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? batches[0] ?? null,
    [batches, selectedBatchId]
  );

  const openBatchCountOnPage = useMemo(
    () => batches.filter((batch) => batch.quantityAvailable > 0).length,
    [batches],
  );
  const expiringSoonCountOnPage = useMemo(
    () =>
      batches.filter((batch) => {
        if (!batch.expiryDate || batch.quantityAvailable <= 0) return false;
        const days = (new Date(batch.expiryDate).getTime() - todayMs) / (1000 * 60 * 60 * 24);
        return days >= 0 && days <= 30;
      }).length,
    [batches, todayMs],
  );
  const availableValueOnPage = useMemo(
    () => batches.reduce((sum, batch) => sum + batch.quantityAvailable * batch.unitCost, 0),
    [batches],
  );
  const materialCoverageOnPage = useMemo(
    () => new Set(batches.map((batch) => batch.materialId)).size,
    [batches],
  );

  const columns: Column<StockBatch>[] = [
    {
      key: 'batchNumber',
      header: 'Batch',
      sortable: true,
      render: (batch) => (
        <div className="min-w-[180px]">
          <div className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            {batch.batchNumber}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Receipt {batch.receiptNumber || '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'materialName',
      header: 'Material',
      sortable: true,
      render: (batch) => (
        <div className="min-w-[220px]">
          <div className="font-medium text-foreground">{batch.materialName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{batch.materialUnit}</span>
            {batch.warehouse ? (
              <>
                <span className="text-muted-foreground/50">/</span>
                <span>{batch.warehouse}</span>
              </>
            ) : null}
            {batch.stockType ? (
              <>
                <span className="text-muted-foreground/50">/</span>
                <span>{batch.stockType}</span>
              </>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: 'supplierName',
      header: 'Supplier',
      sortable: true,
      render: (batch) =>
        batch.supplierName ? (
          <span className="text-sm text-foreground">{batch.supplierName}</span>
        ) : (
          <span className="text-muted-foreground">Walk-in / not linked</span>
        ),
    },
    {
      key: 'quantityAvailable',
      header: 'Available',
      sortable: true,
      render: (batch) => {
        const fill = ratio(batch.quantityAvailable, batch.quantityReceived);
        return (
          <div className="min-w-[170px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-foreground">
                {formatQty(batch.quantityAvailable)}
              </span>
              <span className="text-xs text-muted-foreground">
                of {formatQty(batch.quantityReceived)}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${fill}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'unitCost',
      header: 'Base Cost',
      sortable: true,
      render: (batch) => (
        <div className="min-w-[110px] text-sm text-foreground">
          {formatMoney(batch.unitCost)}
        </div>
      ),
    },
    {
      key: 'receivedDate',
      header: 'Received',
      sortable: true,
      render: (batch) => (
        <div className="min-w-[120px] text-sm text-foreground">
          {formatDate(batch.receivedDate)}
        </div>
      ),
    },
  ];

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Stock batches</CardTitle>
            <CardDescription>You do not have permission to view stock batches.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Batch ledger</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Stock batch control</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Track every received batch, what is still available, and how dispatch consumes stock behind the screen.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/stock/goods-receipt"
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'inline-flex')}
          >
            Receipt history
          </Link>
          <Link href="/stock/goods-receipt/receive" className={cn(buttonVariants({ size: 'sm' }), 'inline-flex')}>
            New receipt
          </Link>
        </div>
      </header>

      <div className="grid divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        {[
          {
            label: 'Matching batches',
            value: String(totalBatches),
            note: 'Server count for current search',
          },
          {
            label: 'Open on page',
            value: String(openBatchCountOnPage),
            note: 'Still carrying available stock',
          },
          {
            label: 'Available value (page)',
            value: formatMoney(availableValueOnPage),
            note: 'Available qty x base unit cost',
          },
          {
            label: 'Materials on page',
            value: String(materialCoverageOnPage),
            note: `${expiringSoonCountOnPage} expiring within 30 days on this page`,
          },
        ].map((item) => (
          <div key={item.label} className="bg-card px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.95fr)]">
        <SectionShell
          title="Batch list"
          description="Search by batch, material, supplier, or receipt number. Select a row to inspect the costing and consumption flow."
        >
          <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
              FIFO-ready receipt batches
            </span>
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
              Base cost stored per unit
            </span>
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
              Click row for detail
            </span>
          </div>

          <div className="mb-3 max-w-md">
            <label htmlFor="batch-search" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Search
            </label>
            <Input
              id="batch-search"
              className="mt-1.5"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Batch, receipt, material, supplier…"
            />
          </div>

          <DataTable
            columns={columns}
            data={batches}
            loading={isFetching && batches.length === 0}
            emptyText="No stock batches found."
            onRowClick={(batch) => setSelectedBatchId(batch.id)}
            onRowDoubleClick={(batch) => setSelectedBatchId(batch.id)}
            selectedRowId={selectedBatch?.id ?? null}
            serverPagination={{
              page,
              pageSize,
              total: totalBatches,
              pageSizeOptions: STOCK_BATCH_PAGE_SIZE_OPTIONS,
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
            }}
          />
        </SectionShell>

        <div className="flex flex-col gap-5">
          <SectionShell
            title="Batch detail"
            description="The selected batch shows what was received, what remains, and when this layer was last touched."
          >
            {selectedBatch ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                    Selected batch
                  </p>
                  <h3 className="mt-2 font-mono text-lg font-semibold text-emerald-800 dark:text-emerald-200">
                    {selectedBatch.batchNumber}
                  </h3>
                  <p className="mt-1 text-sm text-foreground">
                    {selectedBatch.materialName} {selectedBatch.receiptNumber ? `· ${selectedBatch.receiptNumber}` : ''}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Available', `${formatQty(selectedBatch.quantityAvailable)} ${selectedBatch.materialUnit}`],
                    ['Consumed', `${formatQty(selectedBatch.quantityConsumed)} ${selectedBatch.materialUnit}`],
                    ['Base unit cost', formatMoney(selectedBatch.unitCost)],
                    ['Batch value', formatMoney(selectedBatch.totalCost)],
                    ['Supplier', selectedBatch.supplierName || 'Not linked'],
                    ['Latest usage', formatDate(selectedBatch.latestUsageDate)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-border bg-muted/30 px-3 py-3"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-border bg-background px-4 py-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Remaining layer</span>
                    <span>{ratio(selectedBatch.quantityAvailable, selectedBatch.quantityReceived).toFixed(0)}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${ratio(selectedBatch.quantityAvailable, selectedBatch.quantityReceived)}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Received on {formatDate(selectedBatch.receivedDate)}
                    {selectedBatch.expiryDate ? ` · expires ${formatDate(selectedBatch.expiryDate)}` : ''}
                    {selectedBatch.issueLinkCount > 0 ? ` · linked to ${selectedBatch.issueLinkCount} issue transaction${selectedBatch.issueLinkCount === 1 ? '' : 's'}` : ' · not consumed yet'}
                  </p>
                </div>

                {selectedBatch.notes ? (
                  <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                    <p className="mt-1 text-sm text-foreground">{selectedBatch.notes}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a batch from the list to inspect it.</p>
            )}
          </SectionShell>

          <SectionShell
            title="Behind The Screen"
            description="This page also explains the operational flow so batch valuation stays traceable."
          >
            <div className="space-y-3">
              {[
                {
                  step: '1. Goods receipt creates the batch',
                  body: 'When a material is received, the system creates one stock batch row with receipt number, received quantity, available quantity, and the base-unit cost.',
                },
                {
                  step: '2. Cost is normalized to base unit',
                  body: 'If the user buys in a larger UOM like drum, the entered cost is converted to the material base unit before saving. That keeps inventory valuation consistent.',
                },
                {
                  step: '3. Dispatch consumes from the oldest open batch',
                  body: 'On stock-out, the system links the issue transaction to one or more receipt batches. Quantity is reduced from the oldest available batch first, then moves to the next batch when needed.',
                },
                {
                  step: '4. This page reads the live layer status',
                  body: 'The batch list shows the remaining quantity, how much each batch already supplied, and when that batch was last used in a transaction.',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="rounded-lg border border-border bg-muted/30 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-foreground">{item.step}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}

              <div className="rounded-lg border border-sky-500/35 bg-sky-500/10 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200">
                  Example flow
                </p>
                <div className="mt-3 space-y-2 text-sm leading-relaxed text-foreground">
                  <p>
                    Acetone base unit is <strong>kg</strong>.
                  </p>
                  <p>
                    Receipt 1: buy <strong>1 drum = 190 kg</strong> for <strong>AED 950</strong>. The system saves batch cost as <strong>AED 5 per kg</strong>.
                  </p>
                  <p>
                    Receipt 2: later receive another <strong>100 kg</strong> for <strong>AED 520</strong>. That batch saves as <strong>AED 5.20 per kg</strong>.
                  </p>
                  <p>
                    Dispatch 210 kg: the system first consumes all 190 kg from the older batch, then takes 20 kg from the newer batch. This page lets the team see those layers clearly.
                  </p>
                </div>
              </div>
            </div>
          </SectionShell>
        </div>
      </div>
    </div>
  );
}
