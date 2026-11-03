'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import DirectoryListPagination from '@/components/ui/DirectoryListPagination';
import { LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { salesAccess } from '@/lib/sales/access';
import { useDeleteSalesQueryMutation, useGetSalesQueriesQuery } from '@/store/hooks';
import type { SalesClosure, SalesListItem, SalesStage } from '@/store/api/endpoints/sales';

const LABEL_CLASS = 'shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const STATUS_SELECT_CLASS =
  'h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground';

function stageHref(stage: SalesStage, id: string) {
  if (stage === 'QUOTATION') return `/sales/quotations/form?id=${id}`;
  if (stage === 'PURCHASE_ORDER') return `/sales/purchase-orders/form?id=${id}`;
  return `/sales/queries/form?id=${id}`;
}

function stageLabel(stage: SalesStage) {
  if (stage === 'QUOTATION') return 'Quotation';
  if (stage === 'PURCHASE_ORDER') return 'Purchase order';
  return 'Query';
}

export default function SalesListPage({
  eyebrow,
  title,
  description,
  stage,
  closure,
  showQueryQueue,
  showClosureFilter,
  showGrandTotal,
  withoutJob,
  addHref,
  addLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  stage?: SalesStage;
  closure?: SalesClosure;
  showQueryQueue?: boolean;
  showClosureFilter?: boolean;
  showGrandTotal?: boolean;
  withoutJob?: boolean;
  addHref?: string;
  addLabel?: string;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const access = salesAccess({
    isSuperAdmin: session?.user?.isSuperAdmin,
    permissions: session?.user?.permissions,
  });
  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState<'active' | 'rejected' | 'all'>('active');
  const [closureFilter, setClosureFilter] = useState<SalesClosure | 'ALL'>('OPEN');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(LIST_PAGE_SIZE_OPTIONS[0]);
  const [pendingDelete, setPendingDelete] = useState<SalesListItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteQuery] = useDeleteSalesQueryMutation();

  const query = useGetSalesQueriesQuery({
    limit: pageSize,
    offset: (page - 1) * pageSize,
    search: search.trim() || undefined,
    stage,
    closure: showQueryQueue
      ? (queue === 'rejected' ? 'REJECTED' : closure)
      : showClosureFilter
        ? (closureFilter === 'ALL' ? undefined : closureFilter)
        : closure,
    excludeClosure: showQueryQueue && queue === 'active' ? 'REJECTED' : undefined,
    withoutJob,
  });

  const items = query.currentData?.items ?? [];
  const total = query.currentData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize;

  const canAdd = Boolean(addHref && access.queryManage);
  const canDelete = stage === 'QUERY' && access.queryManage;
  const rows = useMemo(() => items, [items]);
  const rowGrid = showGrandTotal
    ? canDelete
      ? 'sm:grid-cols-[1.1fr_1.2fr_1fr_auto_auto_auto]'
      : 'sm:grid-cols-[1.1fr_1.2fr_1fr_auto_auto]'
    : canDelete
      ? 'sm:grid-cols-[1.2fr_1.4fr_1fr_auto_auto]'
      : 'sm:grid-cols-[1.2fr_1.4fr_1fr_auto]';

  async function confirmDelete() {
    if (!pendingDelete || deletingId) return;
    const row = pendingDelete;
    setDeletingId(row.id);
    try {
      await deleteQuery(row.id).unwrap();
      toast.success('Query deleted');
      setPendingDelete(null);
    } catch (error) {
      const message = error && typeof error === 'object' && 'data' in error
        ? (error as { data?: { error?: string } }).data?.error
        : null;
      toast.error(message || 'Could not delete the query');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {canAdd ? (
          <Button type="button" size="sm" onClick={() => router.push(addHref!)}>
            {addLabel}
          </Button>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search number, customer, location, PO…"
          className="sm:max-w-sm"
        />
        {showQueryQueue ? (
          <label className="flex items-center gap-3">
            <span className={LABEL_CLASS}>Status</span>
            <select
              value={queue}
              onChange={(event) => {
                setQueue(event.target.value as 'active' | 'rejected' | 'all');
                setPage(1);
              }}
              className={STATUS_SELECT_CLASS}
            >
              <option value="active">Non-rejected</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>
          </label>
        ) : null}
        {showClosureFilter ? (
          <label className="flex items-center gap-3">
            <span className={LABEL_CLASS}>Status</span>
            <select
              value={closureFilter}
              onChange={(event) => {
                setClosureFilter(event.target.value as SalesClosure | 'ALL');
                setPage(1);
              }}
              className={STATUS_SELECT_CLASS}
            >
              <option value="OPEN">Open</option>
              <option value="LOST">Lost</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="ALL">All</option>
            </select>
          </label>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {query.isError ? (
          <p className="p-5 text-sm text-muted-foreground">You do not have access to this list.</p>
        ) : query.isLoading || !query.currentData ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {showGrandTotal ? (
              <div className={`hidden gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:items-center ${rowGrid}`}>
                <span>Number</span>
                <span>Customer</span>
                <span>Location</span>
                <span>Grand total</span>
                <span>Status</span>
                {canDelete ? <span className="sr-only">Delete</span> : null}
              </div>
            ) : null}
            {rows.map((row) => (
              <div
                key={row.id}
                className={`grid gap-2 px-4 py-4 text-sm hover:bg-muted/40 sm:items-center ${rowGrid}`}
              >
              <Link
                href={stageHref(row.stage, row.id)}
                className="contents"
              >
                    <span>
                      <span className="font-medium text-foreground">
                        {row.stage === 'PURCHASE_ORDER' ? row.poNumber || row.quotationNumber : row.stage === 'QUERY' ? row.queryNumber : row.quotationNumber}
                      </span>
                      {row.stage === 'QUOTATION' ? (
                        <span className="block text-xs text-muted-foreground">Query {row.queryNumber}</span>
                      ) : null}
                      {row.stage === 'QUOTATION' ? (
                        <span className="block text-xs text-muted-foreground">
                          {row.assignedTo ? `Assigned to ${row.assignedTo.name}` : 'Not assigned'}
                        </span>
                      ) : null}
                      {row.stage === 'PURCHASE_ORDER' ? (
                        <span className="block text-xs text-muted-foreground">
                          Quotation {row.quotationNumber} · Query {row.queryNumber}
                        </span>
                      ) : null}
                    </span>
                <span className="text-foreground">{row.displayCustomerName}</span>
                <span className="text-muted-foreground">{row.projectLocation}</span>
                {showGrandTotal ? (
                  <span className="font-medium text-foreground">
                    <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">Grand total</span>
                    {query.currentData?.currencyCode ?? row.currencyCode} {Number(row.grandTotal || 0).toFixed(2)}
                  </span>
                ) : null}
                <span className="flex flex-wrap gap-2">
                  <Badge variant="outline">{stageLabel(row.stage)}</Badge>
                  {row.closure !== 'OPEN' ? <Badge variant="outline">{row.closure}</Badge> : null}
                  {row.job ? <Badge variant="outline">{row.job.jobNumber}</Badge> : null}
                </span>
              </Link>
              {canDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={deletingId === row.id}
                  onClick={() => setPendingDelete(row)}
                >
                  {deletingId === row.id ? <Spinner size="sm" /> : 'Delete'}
                </Button>
              ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        isOpen={Boolean(pendingDelete)}
        onClose={() => {
          if (!deletingId) setPendingDelete(null);
        }}
        title="Delete this query?"
        description={
          pendingDelete
            ? `${pendingDelete.queryNumber} and its files will be removed. This cannot be undone.`
            : undefined
        }
        size="sm"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={Boolean(deletingId)}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={Boolean(deletingId)}
              onClick={() => void confirmDelete()}
            >
              {deletingId ? <Spinner size="sm" /> : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {pendingDelete
            ? `${pendingDelete.displayCustomerName} · ${pendingDelete.projectLocation}`
            : null}
        </p>
      </Modal>

      <DirectoryListPagination
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        total={total}
        pageStart={pageStart}
        pageEnd={pageStart + rows.length}
        pageSizeOptions={LIST_PAGE_SIZE_OPTIONS}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    </div>
  );
}
