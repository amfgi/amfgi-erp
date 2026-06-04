'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { buttonVariants } from '@/components/ui/shadcn/button';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';
import DirectoryListPagination from '@/components/ui/DirectoryListPagination';
import Spinner from '@/components/ui/Spinner';
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { cn } from '@/lib/utils';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import { useGetJobsPageQuery } from '@/store/hooks';
import type { Job } from '@/store/api/endpoints/jobs';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'AED',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(value)}%`;
}

function formatDays(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)} days`;
}

function pricingModeLabel(value: string | undefined) {
  switch (value) {
    case 'FIFO':
      return 'FIFO';
    case 'MOVING_AVERAGE':
      return 'Moving avg';
    case 'CURRENT':
      return 'Current';
    case 'CUSTOM':
      return 'Custom';
    default:
      return value ?? '—';
  }
}

function snapshotBadgeVariant(status: string | undefined) {
  return status === 'APPROVED' ? 'default' : status === 'SUPERSEDED' ? 'secondary' : 'outline';
}

export default function StockJobBudgetPage() {
  const router = useRouter();
  const { openMenu: openContextMenu } = useGlobalContextMenu();
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('stock.job_budget.view');
  const canManage = isSA || perms.includes('settings.manage');

  const openJobBudget = useCallback(
    (jobId: string) => {
      router.push(`/stock/job-budget/${jobId}`);
    },
    [router],
  );

  const handleJobContextMenu = useCallback(
    (job: Job, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const options: ContextMenuOption[] = [
        {
          label: 'Open',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12H9m12 0A9 9 0 113 12a9 9 0 0118 0z"
              />
            </svg>
          ),
          action: () => openJobBudget(job.id),
        },
      ];

      openContextMenu(e.clientX, e.clientY, options);
    },
    [openContextMenu, openJobBudget],
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const deferredSearch = useDeferredValue(searchQuery);

  const { data: jobsPage, isFetching: jobsLoading } = useGetJobsPageQuery(
    {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      search: deferredSearch,
      status: 'ACTIVE',
      scope: 'PARENT_ONLY',
    },
    { skip: !canView, refetchOnMountOrArgChange: 30 },
  );
  const pageSlice = jobsPage?.items ?? [];
  const totalJobs = jobsPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalJobs / pageSize));
  const pageStart = totalJobs === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, totalJobs);

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>
            You need the Stock — Job budget → View permission to open job budget.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stock workspace</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Job budget and formulas</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Manage formula templates and open parent contract jobs only: material budget lines live on the contract;
            dispatch and consumption on variations roll up in costing.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Link href="/stock" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
            Back to stock
          </Link>
          <Link href="/stock/job-budget/formulas" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
            Formula library
          </Link>
          {canManage ? (
            <Link href="/stock/job-budget/formulas/new" className={cn(buttonVariants({ size: 'sm' }))}>
              New formula
            </Link>
          ) : null}
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Contract job budgets</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {jobsLoading
                  ? 'Loading parent contract jobs…'
                  : `${formatNumber(totalJobs)} active parent job${totalJobs === 1 ? '' : 's'} · double-click or right-click a row to open`}
              </p>
            </div>
            <label className="block w-full min-w-0 sm:max-w-xs">
              <span className="sr-only">Search contract jobs</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search job, customer, project…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>
        </div>

        {jobsLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : totalJobs === 0 && !jobsLoading ? (
          <div className="m-4 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No active parent contract jobs match your search.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Job</th>
                    <th className="px-4 py-3 font-medium">Customer / Project</th>
                    <th className="px-4 py-3 text-right font-medium">Budget Items</th>
                    <th className="px-4 py-3 text-right font-medium">Trackable</th>
                    <th className="px-4 py-3 text-right font-medium">Stock Linked</th>
                    <th className="px-4 py-3 text-right font-medium">Progress</th>
                    <th className="px-4 py-3 font-medium">Current Snapshot</th>
                    <th className="px-4 py-3 text-right font-medium">Snapshot Value</th>
                    <th className="px-4 py-3 text-right font-medium">Est. Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageSlice.map((job) => {
                    const summary = job.budgetSummary;
                    const snapshot = summary?.currentSnapshot ?? null;
                    return (
                      <tr
                        key={job.id}
                        data-context-menu="true"
                        className="cursor-pointer align-top transition-colors hover:bg-muted/30"
                        onContextMenu={(event) => handleJobContextMenu(job, event)}
                        onDoubleClick={() => openJobBudget(job.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="min-w-[100px]">
                            <span className="font-mono text-sm font-semibold text-foreground">
                              {job.jobNumber}
                            </span>
                            {/* <p className="mt-1 truncate text-xs text-muted-foreground">
                              {job.site || job.locationName || job.address || 'Parent contract'}
                            </p> */}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {job.customerName || 'No customer'}
                            </p>
                            {/* <p className="mt-1 truncate text-xs text-muted-foreground">
                              {job.projectName || job.description || 'No project details'}
                            </p> */}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">
                          {formatNumber(summary?.budgetItemCount ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">
                          {formatNumber(summary?.trackableItemCount ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">
                          {formatNumber(summary?.stockLinkedTrackableCount ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="tabular-nums font-medium text-foreground">
                              {formatPercent(Number(job.executionProgressPercent ?? 0))}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Lines {formatPercent(summary?.averageBudgetLineProgressPercent)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {snapshot ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={snapshotBadgeVariant(snapshot.status)}>
                                  v{snapshot.versionNumber} {snapshot.status === 'APPROVED' ? 'baseline' : snapshot.status.toLowerCase()}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {pricingModeLabel(snapshot.pricingMode)}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {new Date(snapshot.postingDate).toLocaleDateString()}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No saved snapshot</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                          {formatMoney(snapshot?.totalQuotedMaterialCost)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">
                          {formatDays(snapshot?.totalEstimatedCompletionDays)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalJobs > 0 ? (
              <DirectoryListPagination
                className="border-t border-border p-4"
                page={page}
                pageSize={pageSize}
                totalPages={totalPages}
                total={totalJobs}
                pageStart={pageStart}
                pageEnd={pageEnd}
                pageSizeOptions={LIST_PAGE_SIZE_OPTIONS}
                onPageChange={setPage}
                onPageSizeChange={(nextPageSize) => {
                  setPageSize(nextPageSize);
                  setPage(1);
                }}
              />
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
