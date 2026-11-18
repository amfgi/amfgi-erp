'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
const QUOTATION_VIEW_STORAGE_KEY = 'sales.quotations.listView';
const CELL_LABEL_CLASS = 'mb-0.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:hidden';

type QuotationColumnId = 'number' | 'customer' | 'location' | 'value' | 'status' | 'salesman' | 'updated';
type ListColumnId = QuotationColumnId | 'delete';

type ListColumn = {
  id: ListColumnId;
  label: string;
  width: string;
};

const QUOTATION_COLUMNS: Array<ListColumn & { id: QuotationColumnId; defaultVisible: boolean }> = [
  { id: 'number', label: 'Number', width: 'minmax(0,1.2fr)', defaultVisible: true },
  { id: 'customer', label: 'Customer', width: 'minmax(0,1.3fr)', defaultVisible: true },
  { id: 'location', label: 'Location', width: 'minmax(0,1fr)', defaultVisible: true },
  { id: 'value', label: 'Grand total', width: 'minmax(9rem,max-content)', defaultVisible: true },
  { id: 'status', label: 'Status', width: 'minmax(8rem,12rem)', defaultVisible: true },
  { id: 'salesman', label: 'Salesman', width: 'minmax(0,0.9fr)', defaultVisible: false },
  { id: 'updated', label: 'Updated', width: 'minmax(7.5rem,max-content)', defaultVisible: false },
];

const DEFAULT_QUOTATION_COLUMNS = QUOTATION_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.id);
const DELETE_COLUMN: ListColumn = { id: 'delete', label: 'Delete', width: '5.5rem' };

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

function recordNumber(row: SalesListItem) {
  if (row.stage === 'PURCHASE_ORDER') return row.poNumber || row.quotationNumber;
  if (row.stage === 'QUERY') return row.queryNumber;
  return row.quotationNumber;
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

function readQuotationColumns(): QuotationColumnId[] {
  try {
    const raw = window.localStorage.getItem(QUOTATION_VIEW_STORAGE_KEY);
    if (!raw) return DEFAULT_QUOTATION_COLUMNS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_QUOTATION_COLUMNS;
    const allowed = new Set(parsed);
    const next = QUOTATION_COLUMNS.map((column) => column.id).filter((id) => allowed.has(id));
    return next.length > 0 ? next : DEFAULT_QUOTATION_COLUMNS;
  } catch {
    return DEFAULT_QUOTATION_COLUMNS;
  }
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
  const [columnIds, setColumnIds] = useState<QuotationColumnId[]>(DEFAULT_QUOTATION_COLUMNS);
  const [columnsReady, setColumnsReady] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
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
  const currencyCode = query.currentData?.currencyCode;

  const columns = useMemo(() => {
    if (stage === 'QUOTATION') {
      const selected = new Set(columnIds);
      const next = QUOTATION_COLUMNS.filter((column) => selected.has(column.id));
      return next.length > 0 ? next : QUOTATION_COLUMNS.filter((column) => column.defaultVisible);
    }
    const next: ListColumn[] = QUOTATION_COLUMNS.filter((column) =>
      column.defaultVisible && (column.id !== 'value' || showGrandTotal),
    );
    if (canDelete) next.push(DELETE_COLUMN);
    return next;
  }, [canDelete, columnIds, showGrandTotal, stage]);

  const columnTemplate = columns.map((column) => column.width).join(' ');

  useEffect(() => {
    if (stage !== 'QUOTATION') {
      setColumnsReady(true);
      return;
    }
    setColumnIds(readQuotationColumns());
    setColumnsReady(true);
  }, [stage]);

  useEffect(() => {
    if (!columnsReady || stage !== 'QUOTATION') return;
    window.localStorage.setItem(QUOTATION_VIEW_STORAGE_KEY, JSON.stringify(columnIds));
  }, [columnIds, columnsReady, stage]);

  useEffect(() => {
    if (!viewOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!viewRef.current?.contains(event.target as Node)) setViewOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setViewOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [viewOpen]);

  function toggleColumn(id: QuotationColumnId) {
    setColumnIds((current) => {
      const selected = new Set(current);
      if (selected.has(id)) {
        if (selected.size === 1) return current;
        selected.delete(id);
      } else {
        selected.add(id);
      }
      return QUOTATION_COLUMNS.map((column) => column.id).filter((columnId) => selected.has(columnId));
    });
  }

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

  function renderCell(column: ListColumn, row: SalesListItem) {
    if (column.id === 'number') {
      return (
        <span key={column.id} className="min-w-0 self-start">
          <span className={CELL_LABEL_CLASS}>{column.label}</span>
          <span className="font-medium text-foreground">{recordNumber(row)}</span>
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
      );
    }
    if (column.id === 'customer') {
      return (
        <span key={column.id} className="min-w-0 self-start break-words text-foreground">
          <span className={CELL_LABEL_CLASS}>{column.label}</span>
          {row.displayCustomerName}
        </span>
      );
    }
    if (column.id === 'location') {
      return (
        <span key={column.id} className="min-w-0 self-start break-words text-muted-foreground">
          <span className={CELL_LABEL_CLASS}>{column.label}</span>
          {row.projectLocation}
        </span>
      );
    }
    if (column.id === 'value') {
      return (
        <span key={column.id} className="self-start whitespace-nowrap font-medium tabular-nums text-foreground">
          <span className={CELL_LABEL_CLASS}>{column.label}</span>
          {currencyCode ?? row.currencyCode} {Number(row.grandTotal || 0).toFixed(2)}
        </span>
      );
    }
    if (column.id === 'salesman') {
      return (
        <span key={column.id} className="min-w-0 self-start break-words text-foreground">
          <span className={CELL_LABEL_CLASS}>{column.label}</span>
          {row.salesman.name}
        </span>
      );
    }
    if (column.id === 'updated') {
      return (
        <span key={column.id} className="self-start whitespace-nowrap text-muted-foreground">
          <span className={CELL_LABEL_CLASS}>{column.label}</span>
          {formatUpdated(row.updatedAt)}
        </span>
      );
    }
    if (column.id === 'status') {
      return (
        <span key={column.id} className="self-start">
          <span className={CELL_LABEL_CLASS}>{column.label}</span>
          <span className="flex flex-wrap gap-2">
            <Badge variant="outline">{stageLabel(row.stage)}</Badge>
            {row.closure !== 'OPEN' ? <Badge variant="outline">{row.closure}</Badge> : null}
            {row.job ? <Badge variant="outline">{row.job.jobNumber}</Badge> : null}
          </span>
        </span>
      );
    }
    return null;
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
        {stage === 'QUOTATION' ? (
          <div className="relative" ref={viewRef}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={viewOpen}
              aria-haspopup="true"
              onClick={() => setViewOpen((open) => !open)}
            >
              View
            </Button>
            {viewOpen ? (
              <div className="absolute left-0 z-30 mt-2 w-56 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md">
                <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Show in list
                </p>
                {QUOTATION_COLUMNS.map((column) => {
                  const checked = columnIds.includes(column.id);
                  return (
                    <label
                      key={column.id}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={checked}
                        disabled={checked && columnIds.length === 1}
                        onChange={() => toggleColumn(column.id)}
                      />
                      {column.label}
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
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
          <div
            className="grid grid-cols-1 divide-y divide-border sm:gap-x-3 sm:[grid-template-columns:var(--sales-cols)]"
            style={{ '--sales-cols': columnTemplate } as CSSProperties}
          >
            <div className="col-span-full hidden px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-subgrid sm:items-end">
              {columns.map((column) => (
                <span key={column.id} className={column.id === 'delete' ? 'sr-only' : undefined}>
                  {column.label}
                </span>
              ))}
            </div>
            {rows.map((row) => {
              const cells = columns.map((column) => renderCell(column, row));
              const rowClass = 'col-span-full grid grid-cols-1 gap-2 px-4 py-4 text-sm text-inherit no-underline hover:bg-muted/40 sm:grid-cols-subgrid sm:items-start sm:gap-x-3 sm:gap-y-0';
              if (!canDelete) {
                return (
                  <Link key={row.id} href={stageHref(row.stage, row.id)} className={rowClass}>
                    {cells}
                  </Link>
                );
              }
              return (
                <div key={row.id} className={rowClass}>
                  <Link href={stageHref(row.stage, row.id)} className="contents">
                    {cells}
                  </Link>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="self-start justify-self-start"
                    disabled={deletingId === row.id}
                    onClick={() => setPendingDelete(row)}
                  >
                    {deletingId === row.id ? <Spinner size="sm" /> : 'Delete'}
                  </Button>
                </div>
              );
            })}
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
