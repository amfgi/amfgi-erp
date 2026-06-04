'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';
import JobVariationImportModal from '@/components/jobs/JobVariationImportModal';
import ParentJobImportModal from '@/components/jobs/ParentJobImportModal';
import { exportJobVariationsToXlsx } from '@/lib/import-export/exportJobVariations';
import { exportParentJobsToXlsx } from '@/lib/import-export/exportParentJobs';
import DirectoryListPagination from '@/components/ui/DirectoryListPagination';
import { DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination/serverList';
import {
  useDeleteJobMutation,
  useGetCustomersQuery,
  useGetJobsPageQuery,
  useLazyGetJobsForExportQuery,
  JOB_PAGE_SIZE_OPTIONS,
} from '@/store/hooks';
import { cn } from '@/lib/utils';

interface Job {
  id: string;
  companyId: string;
  externalJobId?: string;
  source?: 'LOCAL' | 'EXTERNAL_API';
  jobNumber: string;
  customerId: string;
  customerName?: string | null;
  description?: string;
  site?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  startDate?: string | Date;
  endDate?: string | Date;
  parentJobId?: string | null;
  createdBy: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

interface Customer {
  id: string;
  name: string;
}

type JobStatusFilter = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
type JobScopeFilter = 'ALL' | 'PARENT_ONLY' | 'VARIATION_ONLY';

function compactNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function extractApiErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data?: unknown }).data === 'object' &&
    (error as { data?: { error?: unknown } }).data?.error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }
  return fallback;
}

function formatDate(value?: string | Date) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString();
}

function statusBadgeVariant(status: Job['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'ACTIVE':
      return 'default';
    case 'COMPLETED':
      return 'secondary';
    case 'ON_HOLD':
      return 'outline';
    case 'CANCELLED':
      return 'destructive';
    default:
      return 'outline';
  }
}

export default function CustomerJobsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [statusFilter, setStatusFilter] = useState<JobStatusFilter>('ALL');
  const [scopeFilter, setScopeFilter] = useState<JobScopeFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const deferredSearch = useDeferredValue(searchQuery);

  const { data: jobsPage, isFetching: jobsLoading } = useGetJobsPageQuery(
    {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      search: deferredSearch,
      status: statusFilter,
      scope: scopeFilter,
    },
    { refetchOnMountOrArgChange: 30 },
  );
  const jobs = jobsPage?.items ?? [];
  const totalJobs = jobsPage?.total ?? 0;
  const activeJobsTotal = jobsPage?.activeTotal ?? 0;

  const [fetchJobsForExport] = useLazyGetJobsForExportQuery();
  const { data: customers = [] } = useGetCustomersQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const { openMenu: openContextMenu } = useGlobalContextMenu();
  const [deleteJob, { isLoading: isDeleting }] = useDeleteJobMutation();

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canCreate = isSA || perms.includes('job.create');
  const canEdit = isSA || perms.includes('job.edit');
  const canDelete = isSA || perms.includes('job.delete');
  const canView = isSA || perms.includes('job.view');
  const canImport = canCreate || canEdit;

  type JobSourceModeUi = 'HYBRID' | 'EXTERNAL_ONLY' | 'INTERNAL_ONLY';
  const [jobSourceMode, setJobSourceMode] = useState<JobSourceModeUi>('HYBRID');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [variationImportModalOpen, setVariationImportModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    job: Job | null;
    loading: boolean;
    linkedCount: number;
    canDelete: boolean;
  }>({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true });

  useEffect(() => {
    if (!session?.user?.activeCompanyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && res.ok && json?.success) {
          const m = json.data?.jobSourceMode;
          setJobSourceMode(m === 'EXTERNAL_ONLY' || m === 'INTERNAL_ONLY' || m === 'HYBRID' ? m : 'HYBRID');
        }
      } catch {
        if (!cancelled) setJobSourceMode('HYBRID');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.activeCompanyId]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, statusFilter, scopeFilter, pageSize]);

  const customerNameById = useMemo(
    () => new Map(customers.map((customer: Customer) => [customer.id, customer.name])),
    [customers],
  );

  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const rootJobs = useMemo(() => jobs.filter((job) => !job.parentJobId), [jobs]);
  const variationJobs = useMemo(() => jobs.filter((job) => Boolean(job.parentJobId)), [jobs]);
  const variationsByParent = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of jobs) {
      if (!job.parentJobId) continue;
      const current = map.get(job.parentJobId) ?? [];
      current.push(job);
      map.set(job.parentJobId, current);
    }
    return map;
  }, [jobs]);
  const displayJobs = jobs;

  const totalVariationsOnPage = useMemo(() => variationJobs.length, [variationJobs]);
  const apiJobsOnPage = useMemo(() => rootJobs.filter((job) => job.source === 'EXTERNAL_API').length, [rootJobs]);

  const totalPages = Math.max(1, Math.ceil(totalJobs / pageSize));
  const pageStart = totalJobs === 0 ? 0 : (page - 1) * pageSize;

  const handleCreateJob = () => {
    router.push('/customers/jobs/form?mode=create');
  };

  const handleEditJob = (job: Job) => {
    router.push(`/customers/jobs/form?mode=edit&id=${job.id}`);
  };

  const handleCreateVariation = (job: Job) => {
    router.push(`/customers/jobs/form?mode=variation&parentJobId=${job.id}&customerId=${job.customerId}`);
  };

  const closeDeleteModal = () =>
    setDeleteModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true });

  const handleDelete = async () => {
    if (!deleteModal.job) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      await deleteJob(deleteModal.job.id).unwrap();
      toast.success('Job deleted');
      closeDeleteModal();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Failed to delete job'));
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleJobContextMenu = (job: Job, e: React.MouseEvent) => {
    e.preventDefault();
    const options: ContextMenuOption[] = [
      {
        label: 'Open Job Ledger',
        action: () => router.push(`/customers/jobs/${job.id}`),
      },
      ...(job.parentJobId
        ? [
            {
              label: 'Budget',
              action: () => router.push(`/stock/job-budget/${job.id}`),
            } satisfies ContextMenuOption,
          ]
        : []),
    ];

    if (canEdit) {
      options.push({ divider: true });
      options.push({
        label: 'Edit Job',
        action: () => handleEditJob(job),
      });
    }

    if (!job.parentJobId) {
      options.push({ divider: true });
      options.push({
        label: 'Create Variation',
        action: () => handleCreateVariation(job),
      });
    }

    if (canDelete) {
      options.push({ divider: true });
      options.push({
        label: job.parentJobId ? 'Delete Variation' : 'Delete Job',
        danger: true,
        action: async () => {
          try {
            const res = await fetch(`/api/jobs/${job.id}/check-delete`);
            const data = await res.json();
            if (data.data) {
              setDeleteModal({
                open: true,
                job,
                loading: false,
                linkedCount: data.data.linkedTransactionsCount ?? 0,
                canDelete: data.data.canDelete ?? false,
              });
            }
          } catch {
            toast.error('Failed to check job dependencies');
          }
        },
      });
    }

    openContextMenu(e.clientX, e.clientY, options);
  };

  const statTiles = [
    {
      label: 'Matching filters',
      value: compactNumber(totalJobs),
      note: 'Total in directory (server count)',
    },
    {
      label: 'Active',
      value: compactNumber(activeJobsTotal),
      note: 'Matching search & scope (server count)',
    },
    {
      label: 'API parents on page',
      value: compactNumber(apiJobsOnPage),
      note: 'Synced from external API',
    },
    {
      label: 'Variations on page',
      value: compactNumber(totalVariationsOnPage),
      note: 'Current page only',
    },
  ];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer jobs</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Jobs</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Parent jobs, variations, and ledger entry points in one list. Right-click a row for actions.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => router.push('/customers')}>
            Customers
          </Button>
          {canView ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                const allJobs = await fetchJobsForExport().unwrap();
                const count = exportParentJobsToXlsx(allJobs);
                if (count === 0) {
                  toast.error('No parent jobs to export');
                  return;
                }
                toast.success(`Exported ${count} parent job(s)`);
              }}
            >
              Export parents
            </Button>
          ) : null}
          {canImport ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setImportModalOpen(true)}>
              Import parents
            </Button>
          ) : null}
          {canView ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                const allJobs = await fetchJobsForExport().unwrap();
                const count = exportJobVariationsToXlsx(allJobs);
                if (count === 0) {
                  toast.error('No job variations to export');
                  return;
                }
                toast.success(`Exported ${count} variation(s)`);
              }}
            >
              Export variations
            </Button>
          ) : null}
          {canImport ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVariationImportModalOpen(true)}
            >
              Import variations
            </Button>
          ) : null}
          {canCreate && jobSourceMode !== 'EXTERNAL_ONLY' ? (
            <Button type="button" size="sm" onClick={handleCreateJob}>
              Add job
            </Button>
          ) : null}
        </div>
      </header>

      <ParentJobImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />
      <JobVariationImportModal
        isOpen={variationImportModalOpen}
        onClose={() => setVariationImportModalOpen(false)}
      />

      <div className="grid w-full min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {statTiles.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{item.value}</p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{item.note}</p>
          </div>
        ))}
      </div>

      {jobSourceMode === 'EXTERNAL_ONLY' ? (
        <Alert>
          <AlertTitle>External API parents</AlertTitle>
          <AlertDescription>
            Parent job creation is disabled for this company. Parents come from the external API; you can still add
            local variations from those parents.
          </AlertDescription>
        </Alert>
      ) : null}
      {jobSourceMode === 'INTERNAL_ONLY' ? (
        <Alert>
          <AlertTitle>Internal-only jobs</AlertTitle>
          <AlertDescription>
            Inbound job sync from the Project Management API is disabled. Use local parent jobs and variations only.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 border-b border-border pb-4 lg:grid-cols-[minmax(0,1fr)_11rem_11rem]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="job-search" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Search
            </label>
            <Input
              id="job-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Job number, customer, site, description…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="job-scope" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Scope
            </label>
            <Select
              id="job-scope"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as JobScopeFilter)}
            >
              <option value="ALL">All jobs & variations</option>
              <option value="PARENT_ONLY">Parents only</option>
              <option value="VARIATION_ONLY">Variations only</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="job-status" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </label>
            <Select
              id="job-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as JobStatusFilter)}
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="ON_HOLD">On hold</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-border">
          {jobsLoading && jobs.length === 0 ? (
            <div className="flex flex-col divide-y divide-border">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <Skeleton className="h-8 w-24 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-48 max-w-full" />
                    <Skeleton className="h-3 w-full max-w-md" />
                  </div>
                  <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          ) : displayJobs.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">No jobs match the current filters.</div>
          ) : (
            <>
              <div
                className="hidden border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground xl:grid xl:grid-cols-[minmax(11rem,0.75fr)_minmax(0,1.25fr)_minmax(12rem,0.95fr)_9.5rem_minmax(9rem,1fr)]"
                aria-hidden
              >
                <span>Job</span>
                <span>Customer & details</span>
                <span>Site & schedule</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-border">
                {displayJobs.map((job) => {
                  const variations = variationsByParent.get(job.id) ?? [];
                  const parentJob = job.parentJobId ? jobById.get(job.parentJobId) : null;
                  const isVariation = Boolean(job.parentJobId);
                  const customerName =
                    job.customerName ?? customerNameById.get(job.customerId) ?? 'Unknown customer';

                  const typeLabel = isVariation ? 'Variation' : job.source === 'EXTERNAL_API' ? 'API parent' : 'Parent';
                  const lineageVariant = isVariation
                    ? 'outline'
                    : job.source === 'EXTERNAL_API'
                      ? 'secondary'
                      : 'default';

                  return (
                    <Link
                      key={job.id}
                      href={`/customers/jobs/${job.id}`}
                      onContextMenu={(e) => handleJobContextMenu(job, e)}
                      className={cn(
                        'grid grid-cols-1 gap-3 px-4 py-3 transition-colors hover:bg-muted/50 xl:grid-cols-[minmax(11rem,0.75fr)_minmax(0,1.25fr)_minmax(12rem,0.95fr)_9.5rem_minmax(9rem,1fr)] xl:items-center xl:gap-0',
                        isVariation && 'bg-muted/15',
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={cn(
                            'mt-1 h-8 w-1 shrink-0 rounded-full',
                            isVariation ? 'bg-primary' : 'bg-muted-foreground/40',
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{job.jobNumber}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge variant={lineageVariant} className="text-[10px] uppercase tracking-wide">
                              {typeLabel}
                            </Badge>
                            {parentJob ? (
                              <span className="truncate text-xs text-muted-foreground">Parent {parentJob.jobNumber}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0 xl:border-l xl:border-border xl:pl-4">
                        <p className="text-sm font-medium text-foreground">{customerName}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {job.description || 'No description'}
                        </p>
                        {parentJob ? (
                          <p className="mt-1 text-xs text-muted-foreground">Scope: {parentJob.jobNumber}</p>
                        ) : null}
                      </div>

                      <div className="min-w-0 xl:border-l xl:border-border xl:pl-4">
                        <p className="text-sm text-foreground">{job.site || 'Site not set'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isVariation
                            ? 'Budget & dispatch on this variation'
                            : variations.length > 0
                              ? `${compactNumber(variations.length)} variation${variations.length === 1 ? '' : 's'}`
                              : 'No variations'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Start {formatDate(job.startDate)}</p>
                      </div>

                      <div className="flex items-center xl:border-l xl:border-border xl:pl-4">
                        <Badge variant={statusBadgeVariant(job.status)} className="whitespace-nowrap text-[10px] uppercase tracking-wide">
                          {job.status.replace('_', ' ')}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground xl:border-l xl:border-border xl:pl-4">
                        <span className="hidden xl:inline">Right-click for more</span>
                        <span aria-hidden className="text-muted-foreground">
                          →
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <DirectoryListPagination
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          total={totalJobs}
          pageStart={pageStart}
          pageEnd={pageStart + displayJobs.length}
          pageSizeOptions={JOB_PAGE_SIZE_OPTIONS}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </section>

      {deleteModal.open && deleteModal.job ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50"
            aria-label="Close dialog"
            onClick={() => !deleteModal.loading && closeDeleteModal()}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-job-title"
            className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-destructive">Remove job</p>
            <h2 id="delete-job-title" className="mt-2 text-lg font-semibold text-foreground">
              {deleteModal.job.jobNumber}
            </h2>

            {!deleteModal.canDelete ? (
              <>
                <p className="mt-3 text-sm text-muted-foreground">
                  Linked to {deleteModal.linkedCount} transaction{deleteModal.linkedCount === 1 ? '' : 's'} — cannot
                  delete yet.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeDeleteModal}>
                    Close
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-muted-foreground">Delete this job and remove it from the queue?</p>
                <div className="mt-6 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={closeDeleteModal} disabled={deleteModal.loading}>
                    Cancel
                  </Button>
                  <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting || deleteModal.loading}>
                    {deleteModal.loading ? 'Deleting…' : 'Delete'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
