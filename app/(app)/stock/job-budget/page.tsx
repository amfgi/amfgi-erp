'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import Spinner from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useGetFormulaLibrariesQuery, useGetJobsQuery } from '@/store/hooks';

const PAGE_SIZE = 10;

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export default function StockJobBudgetPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || (perms.includes('job.view') && perms.includes('material.view'));
  const canManage = isSA || perms.includes('settings.manage');

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const { data: formulas = [], isLoading: formulasLoading } = useGetFormulaLibrariesQuery(undefined, { skip: !canView });
  const { data: jobs = [], isLoading: jobsLoading } = useGetJobsQuery(undefined, { skip: !canView });

  const parentContractJobs = useMemo(
    () =>
      jobs
        .filter((job) => !job.parentJobId && job.status === 'ACTIVE')
        .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber)),
    [jobs]
  );

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return parentContractJobs;
    return parentContractJobs.filter((job) => {
      const hay = [job.jobNumber, job.customerName, job.projectName, job.description, job.site, job.address]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [parentContractJobs, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredJobs.slice(start, start + PAGE_SIZE);
  }, [filteredJobs, safePage]);

  const fabricationTypes = useMemo(
    () => new Set(formulas.map((formula) => formula.fabricationType)).size,
    [formulas]
  );

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>
            You need job.view and material.view permission to open job budget and formulas.
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

      <section className="grid min-w-0 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Formula templates</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">
              {formulasLoading ? '…' : formatCount(formulas.length)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Fabrication types</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">
              {formulasLoading ? '…' : formatCount(fabricationTypes)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Active contract jobs</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">
              {jobsLoading ? '…' : formatCount(parentContractJobs.length)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Parent jobs only; variations are not listed here.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Contract job numbers</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Search by job number, customer, project, site, or address. Budget is always managed on these parent jobs.
              </p>
            </div>
            <label className="block w-full min-w-0 sm:max-w-xs">
              <span className="sr-only">Search contract jobs</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          {jobsLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : parentContractJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No active parent contract jobs found.
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No jobs match your search.
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {pageSlice.map((job) => (
                  <div key={job.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-mono text-base font-semibold tracking-tight text-foreground">{job.jobNumber}</p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {job.customerName || job.projectName || job.description || 'Contract job'}
                      </p>
                    </div>
                    <Link
                      href={`/stock/job-budget/${job.id}`}
                      className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0')}
                    >
                      Open budget
                    </Link>
                  </div>
                ))}
              </div>
              {filteredJobs.length > PAGE_SIZE ? (
                <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    Page {safePage} of {totalPages} · {formatCount(filteredJobs.length)} job
                    {filteredJobs.length === 1 ? '' : 's'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Link
            href="/stock/job-budget/formulas"
            className="block rounded-lg border border-primary/25 bg-primary/5 p-4 transition hover:border-primary/40 hover:bg-primary/10"
          >
            <p className="text-sm font-semibold text-foreground">Formula library</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Create and maintain reusable formulas for GRP, MEP, steel, and other fabrication scopes.
            </p>
          </Link>

          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Flow</h2>
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              <p>Formula defines dynamic inputs and rules.</p>
              <p>
                Only the parent contract job stores budget lines (job items); variations cannot receive new budget lines
                from the API.
              </p>
              <p>Opening a variation URL under stock job-budget redirects to the parent contract.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
