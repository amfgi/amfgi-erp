'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import { useGetDailyQuantityLogPendingQuery } from '@/store/hooks';

type RowStatus = 'PENDING' | 'FINALIZED';

type Row = {
  workDate: string;
  status: RowStatus;
  scheduleId: string | null;
  title: string | null;
  clientDisplayName: string | null;
  assignmentCount: number | null;
  submittedAt: string | Date | null;
};

const PAGE_SIZE = 10;

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function formatLongDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function formatRelative(value: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function DailyQuantityLogLandingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('job.view');
  const canEdit = isSA || perms.includes('job.edit');

  const { data, isLoading, error } = useGetDailyQuantityLogPendingQuery(undefined, { skip: !canView });

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'ALL' | RowStatus>('ALL');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createDate, setCreateDate] = useState(todayYmd());

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const merged: Row[] = [];
    for (const row of data.pending ?? []) {
      merged.push({
        workDate: row.workDate,
        status: 'PENDING',
        scheduleId: row.scheduleId,
        title: row.title,
        clientDisplayName: row.clientDisplayName,
        assignmentCount: row.assignmentCount,
        submittedAt: null,
      });
    }
    for (const row of data.recentFinalized ?? []) {
      merged.push({
        workDate: row.workDate,
        status: 'FINALIZED',
        scheduleId: null,
        title: null,
        clientDisplayName: null,
        assignmentCount: null,
        submittedAt: row.submittedAt ?? null,
      });
    }
    merged.sort((a, b) => (a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : 0));
    return merged;
  }, [data]);

  const filteredRows = useMemo(() => {
    if (statusFilter === 'ALL') return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);

  const counts = useMemo(() => {
    let pending = 0;
    let finalized = 0;
    for (const r of rows) {
      if (r.status === 'PENDING') pending += 1;
      else finalized += 1;
    }
    return { pending, finalized, total: rows.length };
  }, [rows]);

  const errorMessage = useMemo(() => {
    if (!error) return null;
    if (typeof error === 'object' && error !== null && 'data' in error) {
      const d = (error as { data?: { error?: unknown } }).data;
      if (d && typeof d.error === 'string') return d.error;
    }
    return 'Failed to load';
  }, [error]);

  const openDate = (ymd: string) => {
    router.push(`/stock/daily-quantity-log/${ymd}`);
  };

  const handleCreate = () => {
    if (!createDate || !/^\d{4}-\d{2}-\d{2}$/.test(createDate)) {
      toast.error('Pick a valid date');
      return;
    }
    const finalizedSet = new Set(
      rows.filter((r) => r.status === 'FINALIZED').map((r) => r.workDate)
    );
    if (finalizedSet.has(createDate)) {
      toast(`That day is already finalized — opening in edit mode.`);
    }
    setCreateModalOpen(false);
    openDate(createDate);
  };

  const setFilter = (next: 'ALL' | RowStatus) => {
    setStatusFilter(next);
    setPage(1);
  };

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Daily quantity log</h1>
        <p className="text-slate-500 dark:text-slate-400">You do not have permission to view jobs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300/80">
              Stock workspace
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[1.85rem]">
              Daily quantity log
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              One row per calendar day. Click a <strong className="font-medium text-slate-700 dark:text-slate-300">Pending</strong> day to log
              quantities, or a <strong className="font-medium text-slate-700 dark:text-slate-300">Finalized</strong> day to edit saved values.
              Finalized days cannot accept new progress lines.
            </p>
          </div>
          {canEdit ? (
            <div className="flex shrink-0">
              <Button
                type="button"
                onClick={() => {
                  setCreateDate(todayYmd());
                  setCreateModalOpen(true);
                }}
              >
                + Create new
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <FilterChip
            label="All"
            count={counts.total}
            active={statusFilter === 'ALL'}
            onClick={() => setFilter('ALL')}
          />
          <FilterChip
            label="Pending"
            count={counts.pending}
            active={statusFilter === 'PENDING'}
            onClick={() => setFilter('PENDING')}
            tone="amber"
          />
          <FilterChip
            label="Finalized"
            count={counts.finalized}
            active={statusFilter === 'FINALIZED'}
            onClick={() => setFilter('FINALIZED')}
            tone="emerald"
          />
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700/40 dark:bg-red-950/30 dark:text-red-200">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/70">
          <Spinner size="lg" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-950/70">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {statusFilter === 'PENDING'
              ? 'No pending days right now.'
              : statusFilter === 'FINALIZED'
                ? 'No finalized days yet.'
                : 'Nothing here yet.'}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {canEdit
              ? 'Use “Create new” above to open a date and start logging.'
              : 'Ask an admin to schedule work or finalize a quantity log.'}
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50/60 dark:bg-slate-900/40">
                <tr>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th>Schedule / details</Th>
                  <Th align="right">Jobs</Th>
                  <Th align="right">
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pageRows.map((row) => (
                  <tr
                    key={`${row.status}-${row.workDate}-${row.scheduleId ?? 'fin'}`}
                    onClick={() => openDate(row.workDate)}
                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60"
                  >
                    <td className="whitespace-nowrap px-4 py-3 align-middle">
                      {row.status === 'PENDING' ? (
                        <Badge label="Pending" variant="yellow" />
                      ) : (
                        <Badge label="Finalized" variant="green" />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle">
                      <span className="font-semibold text-slate-900 dark:text-white">{formatLongDate(row.workDate)}</span>
                      <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{row.workDate}</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {row.status === 'PENDING' ? (
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          {row.title || row.clientDisplayName || 'Work schedule'}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          Submitted {formatRelative(row.submittedAt)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right align-middle">
                      {row.assignmentCount !== null ? (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                          {row.assignmentCount} {row.assignmentCount === 1 ? 'job' : 'jobs'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right align-middle">
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {row.status === 'PENDING' ? 'Open →' : 'Edit →'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRows.length > PAGE_SIZE ? (
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={filteredRows.length}
              pageStart={pageStart}
              pageEnd={pageStart + pageRows.length}
              onPageChange={setPage}
            />
          ) : null}
        </section>
      )}

      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create quantity log entry"
        size="sm"
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleCreate}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Pick a calendar date. We&apos;ll open the entry screen where you can add jobs and quantities. If the date is already finalized, you&apos;ll
            land in edit mode.
          </p>
          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">
            Work date
            <input
              type="date"
              value={createDate}
              onChange={(e) => setCreateDate(e.target.value)}
              className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  tone = 'slate',
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'slate' | 'amber' | 'emerald';
}) {
  const toneActive: Record<typeof tone, string> = {
    slate: 'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white',
    amber: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-600/60 dark:bg-amber-900/40 dark:text-amber-100',
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-600/60 dark:bg-emerald-900/40 dark:text-emerald-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors',
        active
          ? toneActive[tone]
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:bg-slate-900/60',
      ].join(' ')}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs font-semibold tabular-nums">{count}</span>
    </button>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  pageStart,
  pageEnd,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageStart: number;
  pageEnd: number;
  onPageChange: (next: number) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 sm:flex-row">
      <span>
        Showing <strong className="text-slate-900 dark:text-white">{pageStart + 1}</strong>–
        <strong className="text-slate-900 dark:text-white">{pageEnd}</strong> of{' '}
        <strong className="text-slate-900 dark:text-white">{total}</strong>
      </span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <span className="px-3 font-semibold text-slate-700 dark:text-slate-200">
          Page {page} of {totalPages}
        </span>
        <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
