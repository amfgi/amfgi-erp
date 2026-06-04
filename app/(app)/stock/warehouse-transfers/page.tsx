'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import DataTable from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination/serverList';
import { cn } from '@/lib/utils';
import {
  useGetWarehouseTransferLedgerPageQuery,
  WAREHOUSE_TRANSFER_PAGE_SIZE_OPTIONS,
} from '@/store/hooks';
import type { WarehouseTransferLedgerItem } from '@/store/api/endpoints/transactions';

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString();
}

export default function WarehouseTransfersPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('stock.warehouse_transfer.view');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);

  const { data: transfersPage, isFetching } = useGetWarehouseTransferLedgerPageQuery(
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
  const transfers = transfersPage?.items ?? [];
  const totalTransfers = transfersPage?.total ?? 0;

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, pageSize]);

  const columns: Column<WarehouseTransferLedgerItem>[] = [
    {
      key: 'materialName',
      header: 'Material',
      sortable: true,
      render: (row) => (
        <div className="min-w-[200px]">
          <div className="font-medium text-foreground">{row.materialName}</div>
          <p className="mt-1 text-xs text-muted-foreground">{row.unit}</p>
        </div>
      ),
    },
    {
      key: 'sourceWarehouseName',
      header: 'From',
      sortable: true,
      render: (row) => <span className="text-sm text-foreground">{row.sourceWarehouseName ?? '—'}</span>,
    },
    {
      key: 'destinationWarehouseName',
      header: 'To',
      sortable: true,
      render: (row) => <span className="text-sm text-foreground">{row.destinationWarehouseName ?? '—'}</span>,
    },
    {
      key: 'quantity',
      header: 'Qty',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm text-foreground">{formatQty(row.quantity)}</span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: (row) => <span className="text-sm text-foreground">{formatDate(row.date)}</span>,
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (row) => (
        <span className="max-w-[280px] truncate text-sm text-muted-foreground">{row.notes || '—'}</span>
      ),
    },
  ];

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <header className="border-b border-border pb-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Warehouse transfers</h1>
        </header>
        <Alert>
          <AlertDescription>You do not have permission to view warehouse transfers.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Transfer ledger</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Warehouse transfers</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Move stock between warehouses within the active company. Company total quantity stays the same; FIFO
            layers move from source to destination.
          </p>
        </div>
        <Link
          href="/stock/warehouse-transfers/new"
          className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}
        >
          New warehouse transfer
        </Link>
      </header>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Transfers logged</p>
          <p className="mt-2 text-xl font-semibold text-foreground">{totalTransfers}</p>
        </CardContent>
      </Card>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 max-w-md">
          <label htmlFor="wh-transfer-search" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Search
          </label>
          <Input
            id="wh-transfer-search"
            className="mt-1.5"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Material, warehouse, notes…"
          />
        </div>

        <DataTable
          columns={columns}
          data={transfers}
          loading={isFetching && transfers.length === 0}
          emptyText="No warehouse transfers found."
          serverPagination={{
            page,
            pageSize,
            total: totalTransfers,
            pageSizeOptions: WAREHOUSE_TRANSFER_PAGE_SIZE_OPTIONS,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setPage(1);
            },
          }}
        />
      </section>
    </div>
  );
}
