'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { cn } from '@/lib/utils';
import { useGetFactoryProductionsQuery, type FactoryProductionEntry } from '@/store/hooks';

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
}

type LedgerRow = FactoryProductionEntry & { materialSummary: string };

export default function FactoryProductionListPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const canView = isSuperAdmin || perms.includes('transaction.stock_in') || perms.includes('material.view');
  const canPost = isSuperAdmin || perms.includes('transaction.stock_in');

  const { data: entries = [], isLoading, isFetching } = useGetFactoryProductionsQuery(undefined, { skip: !canView });
  const [viewEntry, setViewEntry] = useState<FactoryProductionEntry | null>(null);
  const rows = useMemo<LedgerRow[]>(
    () =>
      entries.map((entry) => ({
        ...entry,
        materialSummary: entry.lines.map((line) => `${line.materialName} ${line.unit}`).join(' '),
      })),
    [entries]
  );

  const totals = useMemo(() => {
    const lineCount = entries.reduce((sum, entry) => sum + entry.lines.length, 0);
    const quantity = entries.reduce(
      (sum, entry) => sum + entry.lines.reduce((lineSum, line) => lineSum + line.quantity, 0),
      0
    );
    const warehouses = new Set(entries.map((entry) => entry.warehouseId)).size;
    return { lineCount, quantity, warehouses };
  }, [entries]);

  const columns: Column<LedgerRow>[] = useMemo(
    () => [
      {
        key: 'productionDate',
        header: 'Date',
        sortable: true,
        render: (entry) => (
          <div className="min-w-[140px]">
            <div className="font-medium text-foreground">{formatDate(entry.productionDate)}</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">FP-{entry.id.slice(-8).toUpperCase()}</div>
          </div>
        ),
      },
      {
        key: 'warehouseName',
        header: 'Warehouse',
        sortable: true,
        render: (entry) => <span className="font-medium text-foreground">{entry.warehouseName}</span>,
      },
      {
        key: 'lines',
        header: 'Lines',
        render: (entry) => (
          <div className="min-w-[220px]">
            <div className="text-sm text-foreground">
              {entry.lines.length} material{entry.lines.length === 1 ? '' : 's'}
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {entry.lines.map((line) => line.materialName).join(', ') || '—'}
            </div>
          </div>
        ),
      },
      {
        key: 'quantity',
        header: 'Quantity',
        render: (entry) => (
          <span className="tabular-nums text-foreground">
            {formatQty(entry.lines.reduce((sum, line) => sum + line.quantity, 0))}
          </span>
        ),
      },
      {
        key: 'createdByName',
        header: 'Posted by',
        sortable: true,
        render: (entry) => <span className="text-sm text-foreground">{entry.createdByName}</span>,
      },
      {
        key: 'materialSummary',
        header: 'Materials',
        hiddenByDefault: true,
        render: (entry) => <span className="text-sm text-muted-foreground">{entry.materialSummary}</span>,
      },
      {
        key: 'notes',
        header: 'Notes',
        render: (entry) =>
          entry.notes ? (
            <span className="text-sm text-muted-foreground">
              {entry.notes.length > 72 ? `${entry.notes.slice(0, 72)}…` : entry.notes}
            </span>
          ) : (
            <span className="text-muted-foreground">No notes</span>
          ),
      },
    ],
    []
  );

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <header className="border-b border-border pb-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Factory production</h1>
        </header>
        <Alert>
          <AlertDescription>You do not have permission to view factory production.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Production ledger</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Factory production</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Reusable material received into warehouse stock. These entries are not tied to a customer job.
          </p>
        </div>
        {canPost ? (
          <Link href="/stock/factory-production/new" className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>
            New production
          </Link>
        ) : null}
      </header>

      <section className="grid min-w-0 gap-3 sm:grid-cols-3">
        {[
          { label: 'Entries', value: String(entries.length), note: 'Posted production receipts' },
          { label: 'Material lines', value: String(totals.lineCount), note: 'Rows received into stock' },
          { label: 'Warehouses', value: String(totals.warehouses), note: 'Destinations used' },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Production ledger</h2>
          <p className="mt-1 text-sm text-muted-foreground">Open an entry to see the materials that were received.</p>
        </div>
        <div className="p-5">
          <DataTable
            columns={columns}
            data={rows}
            loading={isLoading || (isFetching && entries.length === 0)}
            emptyText="No factory production has been received yet."
            searchKeys={['productionDate', 'warehouseName', 'notes', 'createdByName', 'materialSummary']}
            enableColumnDisplayOptions
            preferenceKey="stock-factory-production-table"
            onRowClick={(entry) => setViewEntry(entry)}
          />
        </div>
      </section>

      {viewEntry ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setViewEntry(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,44rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Factory production</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  {formatDate(viewEntry.productionDate)} · {viewEntry.warehouseName}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  FP-{viewEntry.id.slice(-8).toUpperCase()} · {viewEntry.createdByName}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setViewEntry(null)}>
                Close
              </Button>
            </div>
            {viewEntry.notes ? <p className="mt-4 text-sm text-muted-foreground">{viewEntry.notes}</p> : null}
            <div className="mt-4 overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Material</th>
                    <th className="px-3 py-2 text-right font-medium">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {viewEntry.lines.map((line) => (
                    <tr key={line.id} className="border-t border-border">
                      <td className="px-3 py-2 text-foreground">{line.materialName}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">
                        {formatQty(line.quantity)} {line.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
