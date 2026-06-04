'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import DirectoryListPagination from '@/components/ui/DirectoryListPagination';
import Modal from '@/components/ui/Modal';
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { cn } from '@/lib/utils';
import {
  useDeleteTransactionMutation,
  useGetNonStockReconcileDataQuery,
  useGetNonStockReconcileHistoryPageQuery,
} from '@/store/hooks';
import type { NonStockReconcileHistoryItem } from '@/store/api/endpoints/transactions';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function formatMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function IssueReconcilePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [historySearch, setHistorySearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const deferredHistorySearch = useDeferredValue(historySearch);

  const { data, isLoading } = useGetNonStockReconcileDataQuery({ omitHistory: true });
  const { data: historyPage, isFetching: historyLoading } = useGetNonStockReconcileHistoryPageQuery({
    limit: pageSize,
    offset: (page - 1) * pageSize,
    search: deferredHistorySearch,
  });
  const history = historyPage?.history ?? [];
  const historyTotal = historyPage?.historyTotal ?? 0;
  const totalPages = Math.max(1, Math.ceil(historyTotal / pageSize));
  const pageStart = historyTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, historyTotal);

  useEffect(() => {
    setPage(1);
  }, [deferredHistorySearch, pageSize]);

  const [deleteTransaction, { isLoading: deleting }] = useDeleteTransactionMutation();
  const [warningEntryId, setWarningEntryId] = useState<string | null>(null);
  const [viewEntry, setViewEntry] = useState<NonStockReconcileHistoryItem | null>(null);
  const [editEntry, setEditEntry] = useState<NonStockReconcileHistoryItem | null>(null);
  const perms = (session?.user?.permissions ?? []) as string[];
  const canReconcile = (session?.user?.isSuperAdmin ?? false) || perms.includes('transaction.reconcile');

  if (!canReconcile) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to access issue reconcile.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!warningEntryId) return;
    try {
      await deleteTransaction(warningEntryId).unwrap();
      toast.success('Reconcile entry deleted');
      setWarningEntryId(null);
    } catch (error: unknown) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to delete reconcile entry';
      toast.error(message);
    }
  };

  if (isLoading && data == null) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <div className="h-24 animate-pulse rounded-lg border border-border bg-muted/30" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted/30" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-border bg-muted/30" />
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Issue reconcile</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Reconcile history and controls</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Review previous non-stock issue reconciliations and open the manual create screen when you need to distribute
            fresh quantities into variation jobs sourced from monthly dispatch-note activity.
          </p>
        </div>
        <Link href="/stock/issue-reconcile/new" className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>
          Create reconcile
        </Link>
      </header>

      <section className="grid min-w-0 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">History rows</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{historyTotal}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Variation jobs</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{data?.jobs.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Non-stock items</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{data?.materials.length ?? 0}</p>
          </CardContent>
        </Card>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Previous history</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Recent non-stock reconcile postings across job variations.
              </p>
            </div>
            <label className="block w-full sm:max-w-xs">
              <span className="sr-only">Search history</span>
              <input
                type="search"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search material, job, customer…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Average</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-muted-foreground">
              {history.map((entry) => (
                <tr key={entry.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">{new Date(entry.date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{entry.materialName}</td>
                  <td className="px-4 py-3">
                    <div className="text-foreground">{entry.jobNumber}</div>
                    {entry.jobDescription ? (
                      <div className="mt-1 text-xs text-muted-foreground">{entry.jobDescription}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{entry.customerName || '-'}</td>
                  <td className="px-4 py-3">
                    {formatNumber(entry.quantity)} {entry.unit}
                  </td>
                  <td className="px-4 py-3">{formatMoney(entry.averageCost)}</td>
                  <td className="px-4 py-3">{formatMoney(entry.totalCost)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setViewEntry(entry)}>
                        View
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => setEditEntry(entry)}>
                        Edit
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setWarningEntryId(entry.id)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !historyLoading && history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No reconcile history yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {historyTotal > 0 ? (
          <DirectoryListPagination
            className="border-t border-border px-4 py-3"
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            total={historyTotal}
            pageStart={pageStart}
            pageEnd={pageEnd}
            pageSizeOptions={LIST_PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        ) : null}
      </section>

      <Modal
        isOpen={Boolean(warningEntryId)}
        onClose={() => setWarningEntryId(null)}
        title="Delete reconcile entry"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">This will delete the selected reconcile transaction.</p>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-3 text-xs leading-6 text-amber-900 dark:text-amber-100">
            After delete: the distributed issue cost is removed from that job, the reconciled stock quantity is added
            back to material stock, and any FIFO batch quantities consumed by this reconcile are restored.
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" className="min-w-0 flex-1" onClick={() => setWarningEntryId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-w-0 flex-1"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(viewEntry)} onClose={() => setViewEntry(null)} title="Reconcile entry">
        {viewEntry ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Date:</span> {new Date(viewEntry.date).toLocaleString()}
            </div>
            <div>
              <span className="font-medium text-foreground">Material:</span> {viewEntry.materialName}
            </div>
            <div>
              <span className="font-medium text-foreground">Job:</span> {viewEntry.jobNumber}
            </div>
            <div>
              <span className="font-medium text-foreground">Company:</span> {viewEntry.customerName || '-'}
            </div>
            <div>
              <span className="font-medium text-foreground">Quantity:</span> {formatNumber(viewEntry.quantity)}{' '}
              {viewEntry.unit}
            </div>
            <div>
              <span className="font-medium text-foreground">Average cost:</span> {formatMoney(viewEntry.averageCost)}
            </div>
            <div>
              <span className="font-medium text-foreground">Total cost:</span> {formatMoney(viewEntry.totalCost)}
            </div>
            <div>
              <span className="font-medium text-foreground">Notes:</span> {viewEntry.notes || '-'}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={Boolean(editEntry)} onClose={() => setEditEntry(null)} title="Edit reconcile entry">
        {editEntry ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You are about to edit this reconcile entry for{' '}
              <span className="font-medium text-foreground">{editEntry.materialName}</span> on job{' '}
              <span className="font-medium text-foreground">{editEntry.jobNumber}</span>.
            </p>
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-3 text-xs leading-6 text-amber-900 dark:text-amber-100">
              What happens on save: the current reconcile transaction will be deleted first, its stock and FIFO batch
              effects will be reversed, and then a new reconcile transaction will be created from the values you save in
              the edit form.
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="ghost" className="min-w-0 flex-1" onClick={() => setEditEntry(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="min-w-0 flex-1"
                onClick={() => {
                  const targetId = editEntry.id;
                  setEditEntry(null);
                  router.push(`/stock/issue-reconcile/new?transactionId=${targetId}`);
                }}
              >
                Continue to edit
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
