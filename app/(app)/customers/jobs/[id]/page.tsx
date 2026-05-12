'use client';

import { use, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { StatusBadge } from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import JobConsumptionCostingSection from '@/components/jobs/JobConsumptionCostingSection';
import JobScopeFilter, { type JobScopeOption } from '@/components/jobs/JobScopeFilter';
import TransactionLedger from '@/components/transactions/TransactionLedger';
import { useGetCustomersQuery, useGetJobByIdQuery, useGetJobMaterialsQuery, useGetJobsQuery } from '@/store/hooks';

const JobCostEnginePage = dynamic(() => import('@/app/(app)/jobs/[id]/cost-engine/page'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center">
      <Spinner size="lg" />
    </div>
  ),
});

type LedgerTabId = 'costing' | 'materials' | 'transactions' | 'progress' | 'entries';

const LEDGER_TABS: Array<{ id: LedgerTabId; label: string; description: string }> = [
  { id: 'costing', label: 'Budget vs consumption', description: 'Quoted budget against actual stock-out costing' },
  { id: 'materials', label: 'Material summary', description: 'Dispatched, returned, net consumed by material' },
  { id: 'transactions', label: 'Transactions', description: 'Stock movements recorded against the job' },
  { id: 'progress', label: 'Progress', description: 'Job-wide roll-up, pace, and schedule' },
  { id: 'entries', label: 'Quantity log', description: 'Trackable targets and dated quantity entries' },
];

const TABS_REQUIRING_SCOPE: ReadonlyArray<LedgerTabId> = ['costing', 'materials', 'transactions'];

type MaterialSummary = {
  materialId: string;
  materialName: string;
  unit: string;
  dispatched: number;
  returned: number;
  netConsumed: number;
  availableToReturn: number;
};

type JobContact = {
  label?: string;
  name?: string;
  number?: string;
  email?: string;
  designation?: string;
};

type Customer = {
  id: string;
  name: string;
};

function formatDate(value?: string | Date | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-AE');
}

function formatMoney(value?: number | string | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed === 0) return '-';
  return `AED ${parsed.toLocaleString('en-AE', {
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

function safeContacts(value: unknown): JobContact[] {
  return Array.isArray(value) ? value.filter((entry): entry is JobContact => typeof entry === 'object' && entry !== null) : [];
}

function InfoCard({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-base font-semibold text-foreground">{value}</div>
      {note ? <div className="mt-1 text-xs text-muted-foreground">{note}</div> : null}
    </div>
  );
}

export default function CustomerJobLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: job, isLoading: jobLoading } = useGetJobByIdQuery(id);
  const { data: customers = [] } = useGetCustomersQuery();
  const { data: jobs = [] } = useGetJobsQuery();

  const [activeTab, setActiveTab] = useState<LedgerTabId>('costing');

  const isVariation = Boolean(job?.parentJobId);
  const variations = useMemo(
    () => (job && !job.parentJobId ? jobs.filter((entry) => entry.parentJobId === id) : []),
    [job, jobs, id],
  );
  const variationCount = variations.length;

  const scopeOptions = useMemo<JobScopeOption[]>(() => {
    if (!job) return [];
    if (job.parentJobId) {
      return [
        {
          id: job.id,
          jobNumber: job.jobNumber,
          description: job.description,
          isParent: false,
        },
      ];
    }
    return [
      {
        id: job.id,
        jobNumber: job.jobNumber,
        description: job.description,
        isParent: true,
      },
      ...variations.map((variation) => ({
        id: variation.id,
        jobNumber: variation.jobNumber,
        description: variation.description,
        isParent: false,
      })),
    ];
  }, [job, variations]);

  const scopeKey = useMemo(
    () => scopeOptions.map((option) => option.id).slice().sort().join('|'),
    [scopeOptions],
  );
  const [selectionScopeKey, setSelectionScopeKey] = useState<string>('');
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

  if (scopeKey && scopeKey !== selectionScopeKey) {
    setSelectionScopeKey(scopeKey);
    setSelectedJobIds(scopeOptions.map((option) => option.id));
  }

  const totalSelectableJobCount = scopeOptions.length;
  const isFilterActive =
    !isVariation &&
    selectedJobIds.length > 0 &&
    selectedJobIds.length < totalSelectableJobCount;

  const materialsScopeIds =
    selectedJobIds.length > 0 && !isVariation ? selectedJobIds : undefined;

  const { data: materialsData, isLoading: materialsLoading } = useGetJobMaterialsQuery(
    materialsScopeIds && materialsScopeIds.length > 0
      ? { jobId: id, jobIds: materialsScopeIds }
      : id,
    { skip: !job },
  );

  const summary = materialsData || [];
  const isLoading = jobLoading || materialsLoading;

  const customerName = (customers as Customer[]).find((entry) => entry.id === job?.customerId)?.name ?? 'Unknown customer';
  const parentJob = job?.parentJobId ? jobs.find((entry) => entry.id === job.parentJobId) : null;
  const contacts = safeContacts((job as { contactsJson?: unknown } | undefined)?.contactsJson);
  const totalDispatched = summary.reduce((sum, row) => sum + row.dispatched, 0);
  const totalConsumed = summary.reduce((sum, row) => sum + row.netConsumed, 0);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!job) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Job not found.</div>;
  }

  const showScopeCard =
    !isVariation && variationCount > 0 && TABS_REQUIRING_SCOPE.includes(activeTab);

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-4xl space-y-1">
          <Link
            href="/customers/jobs"
            className={cn(
              buttonVariants({ variant: 'link', size: 'sm' }),
              'h-auto p-0 text-xs font-medium uppercase tracking-wide text-muted-foreground',
            )}
          >
            Customers / Jobs / Ledger
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{job.jobNumber}</h1>
            <StatusBadge status={job.status} />
            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {isVariation ? 'Variation' : 'Parent job'}
            </span>
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {job.description || 'No work process details added yet.'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {isVariation ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => router.push(`/stock/job-budget/${id}`)}>
              Costing & Budget
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                router.push(`/customers/jobs/form?mode=variation&parentJobId=${id}&customerId=${job.customerId}`)
              }
            >
              Create Variation
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Customer</p>
          <p className="mt-1 truncate text-lg font-semibold text-foreground">{customerName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{job.site || 'Site not set'}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{isVariation ? 'Parent job' : 'Variations'}</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{isVariation ? parentJob?.jobNumber ?? '-' : variationCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">{isVariation ? 'Reporting container' : 'Linked costing scopes'}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Material movement</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{formatQty(totalConsumed)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatQty(totalDispatched)} dispatched across {summary.length} items
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Commercial value</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney((job as { jobWorkValue?: number | string | null }).jobWorkValue)}</p>
          <p className="mt-1 text-xs text-muted-foreground">LPO {String((job as { lpoNumber?: string | null }).lpoNumber ?? '-')}</p>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap gap-2">
          {LEDGER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'rounded-lg border px-4 py-3 text-left text-sm transition-colors',
                activeTab === tab.id
                  ? 'border-primary bg-primary/10 shadow-sm'
                  : 'border-border bg-card hover:bg-muted/50',
              )}
            >
              <div className={cn('font-semibold', activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground')}>{tab.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{tab.description}</div>
            </button>
          ))}
        </div>
      </section>

      {showScopeCard ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reporting scope</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Switch which jobs feed this tab. Defaults to the parent and all {variationCount} variation{variationCount === 1 ? '' : 's'}.
            </p>
          </div>
          <JobScopeFilter options={scopeOptions} selectedIds={selectedJobIds} onChange={setSelectedJobIds} />
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <main className="space-y-5">
          {activeTab === 'costing' ? (
            <JobConsumptionCostingSection
              jobId={id}
              selectedJobIds={!isVariation ? selectedJobIds : undefined}
              totalSelectableJobCount={totalSelectableJobCount}
            />
          ) : null}

          {activeTab === 'materials' ? (
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border px-4 py-4 sm:px-5">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Material summary</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Dispatched, returned, net consumed, and returnable stock for the selected scope.
                </p>
                {isFilterActive ? (
                  <p className="mt-2 text-xs text-primary">
                    Showing {selectedJobIds.length} of {totalSelectableJobCount} jobs.
                  </p>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Material</th>
                      <th className="px-4 py-3 text-right">Dispatched</th>
                      <th className="px-4 py-3 text-right">Returned</th>
                      <th className="px-4 py-3 text-right">Net Consumed</th>
                      <th className="px-4 py-3 text-right">Available Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((mat: MaterialSummary) => (
                      <tr key={mat.materialId} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{mat.materialName}</div>
                          <div className="text-xs text-muted-foreground">{mat.unit}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">{formatQty(mat.dispatched)}</td>
                        <td className="px-4 py-3 text-right text-foreground">{formatQty(mat.returned)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatQty(mat.netConsumed)}</td>
                        <td className="px-4 py-3 text-right text-foreground">{formatQty(mat.availableToReturn)}</td>
                      </tr>
                    ))}
                    {summary.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No materials dispatched yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeTab === 'transactions' ? (
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border px-4 py-4 sm:px-5">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Transaction ledger</h2>
                <p className="mt-1 text-sm text-muted-foreground">Stock movements recorded against the selected scope.</p>
                {isFilterActive ? (
                  <p className="mt-2 text-xs text-primary">
                    Showing {selectedJobIds.length} of {totalSelectableJobCount} jobs.
                  </p>
                ) : null}
              </div>
              <div className="px-4 py-4 sm:px-5">
                <TransactionLedger
                  jobId={id}
                  jobIds={!isVariation && selectedJobIds.length > 0 ? selectedJobIds : undefined}
                />
              </div>
            </section>
          ) : null}

          {activeTab === 'progress' ? <JobCostEnginePage embeddedTab="progress" /> : null}

          {activeTab === 'entries' ? <JobCostEnginePage embeddedTab="entries" /> : null}
        </main>

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <InfoCard label="Project" value={(job as { projectName?: string | null }).projectName || '-'} note={(job as { projectDetails?: string | null }).projectDetails || 'No project details'} />
          <InfoCard label="Timeline" value={`${formatDate(job.startDate)} - ${formatDate(job.endDate)}`} note={`Status: ${job.status.replace('_', ' ')}`} />
          <InfoCard label="Quotation" value={(job as { quotationNumber?: string | null }).quotationNumber || '-'} note={`Date ${formatDate((job as { quotationDate?: string | Date | null }).quotationDate)}`} />
          <InfoCard label="LPO" value={(job as { lpoNumber?: string | null }).lpoNumber || '-'} note={`Value ${formatMoney((job as { lpoValue?: number | string | null }).lpoValue)} · ${formatDate((job as { lpoDate?: string | Date | null }).lpoDate)}`} />

          <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Location</p>
            <p className="mt-2 text-sm font-medium text-foreground">{(job as { address?: string | null }).address || '-'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(job as { locationName?: string | null }).locationName || '-'} · {(job as { locationLat?: number | null }).locationLat ?? '-'}, {(job as { locationLng?: number | null }).locationLng ?? '-'}
            </p>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Contacts</p>
            <p className="mt-2 text-sm font-medium text-foreground">{(job as { contactPerson?: string | null }).contactPerson || '-'}</p>
            <div className="mt-3 space-y-2">
              {contacts.map((contact, index) => (
                <div key={`${contact.name ?? 'contact'}-${index}`} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{contact.name || '-'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {contact.label ? `[${contact.label}] ` : ''}{contact.number || '-'} · {contact.email || '-'} · {contact.designation || '-'}
                  </p>
                </div>
              ))}
              {contacts.length === 0 ? <p className="text-sm text-muted-foreground">No additional contacts.</p> : null}
            </div>
          </section>
        </aside>
      </div>

    </div>
  );
}
