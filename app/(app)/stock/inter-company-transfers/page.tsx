'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import DataTable from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { cn } from '@/lib/utils';
import { useGetTransferLedgerQuery } from '@/store/hooks';
import type { TransferLedgerItem } from '@/store/api/endpoints/transactions';

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString();
}

export default function InterCompanyTransfersPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('transaction.transfer');

  const { data: transfers = [], isFetching } = useGetTransferLedgerQuery(undefined, {
    skip: !canView,
    refetchOnMountOrArgChange: 30,
  });

  const inboundCount = useMemo(
    () => transfers.filter((transfer) => transfer.direction === 'IN').length,
    [transfers]
  );
  const outboundCount = useMemo(
    () => transfers.filter((transfer) => transfer.direction === 'OUT').length,
    [transfers]
  );
  const movedQty = useMemo(
    () => transfers.reduce((sum, transfer) => sum + transfer.quantity, 0),
    [transfers]
  );
  const counterpartCoverage = useMemo(
    () => new Set(transfers.map((transfer) => transfer.counterpartCompanyName).filter(Boolean)).size,
    [transfers]
  );

  const columns: Column<TransferLedgerItem>[] = [
    {
      key: 'direction',
      header: 'Direction',
      sortable: true,
      render: (transfer) => (
        <span
          className={cn(
            'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide',
            transfer.direction === 'IN'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300'
              : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300',
          )}
        >
          {transfer.direction === 'IN' ? 'Inbound' : 'Outbound'}
        </span>
      ),
    },
    {
      key: 'materialName',
      header: 'Material',
      sortable: true,
      render: (transfer) => (
        <div className="min-w-[220px]">
          <div className="font-medium text-foreground">{transfer.materialName}</div>
          <div className="mt-1 text-xs text-muted-foreground">{transfer.unit}</div>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Qty',
      sortable: true,
      render: (transfer) => (
        <div className="min-w-[110px] text-right font-mono text-sm text-foreground">{formatQty(transfer.quantity)}</div>
      ),
    },
    {
      key: 'counterpartCompanyName',
      header: 'Counterpart',
      sortable: true,
      render: (transfer) => (
        <div className="min-w-[180px] text-sm text-foreground">
          {transfer.counterpartCompanyName || transfer.counterpartCompanySlug || '-'}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: (transfer) => (
        <div className="min-w-[120px] text-sm text-foreground">{formatDate(transfer.date)}</div>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (transfer) => (
        <div className="max-w-[320px] truncate text-sm text-muted-foreground">{transfer.notes || 'No note'}</div>
      ),
    },
  ];

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <header className="border-b border-border pb-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Inter-company transfers</h1>
        </header>
        <Alert>
          <AlertDescription>You do not have permission to view inter-company transfers.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Transfer ledger</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Inter-company stock movement</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Review incoming and outgoing company-to-company stock movement with material, quantity, counterpart, and date
            in one ledger.
          </p>
        </div>
        <Link
          href="/stock/inter-company-transfers/new"
          className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}
        >
          New multi transfer
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Transfers logged', value: String(transfers.length), note: 'Inbound and outbound rows' },
          { label: 'Inbound rows', value: String(inboundCount), note: 'Received from other companies' },
          { label: 'Outbound rows', value: String(outboundCount), note: 'Sent to other companies' },
          {
            label: 'Counterpart companies',
            value: String(counterpartCoverage),
            note: `${formatQty(movedQty)} total units moved`,
          },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Transfer rows</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each row reflects one transfer transaction recorded for the active company.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">{isFetching ? 'Refreshing…' : `${transfers.length} rows`}</div>
        </div>

        <DataTable
          columns={columns}
          data={transfers}
          loading={isFetching && transfers.length === 0}
          emptyText="No inter-company transfers found."
          searchKeys={['materialName', 'counterpartCompanyName', 'counterpartCompanySlug', 'notes']}
        />
      </section>
    </div>
  );
}
