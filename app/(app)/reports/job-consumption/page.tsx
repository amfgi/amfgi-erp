'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';

import JobConsumptionTable from '@/components/reports/JobConsumptionTable';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { useGetJobsQuery, useLazyGetJobConsumptionQuery } from '@/store/hooks';
import { cn } from '@/lib/utils';

export default function JobConsumptionPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const { data: jobs = [] } = useGetJobsQuery(undefined, { skip: !canView });
  const [triggerGetJobConsumption, { data: rows = [], isLoading: loading }] = useLazyGetJobConsumptionQuery();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    setHasSearched(true);
    await triggerGetJobConsumption({
      from: from || undefined,
      to: to || undefined,
      jobIds: selectedJobs,
    });
  };

  const handleExport = () => {
    if (!rows.length) return;

    const headers = ['Job #', 'Material', 'Unit', 'Dispatched', 'Returned', 'Net Consumed'];
    const csvRows = rows.map((r) =>
      [r.jobNumber, r.materialName, r.unit, r.dispatched, r.returned, r.netConsumed].join(','),
    );
    const csv = [headers.join(','), ...csvRows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-consumption-${from || 'all'}-${to || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleJob = (id: string) =>
    setSelectedJobs((prev) => (prev.includes(id) ? prev.filter((j) => j !== id) : [...prev, id]));

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Job consumption</CardTitle>
            <CardDescription>You do not have permission to view this report.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Insights</p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Job consumption</h1>
        <p className="text-sm text-muted-foreground">
          Net material usage per job — dispatched minus end-of-day returns.
        </p>
        <p className="text-sm text-muted-foreground">
          Need budget and profitability context?{' '}
          <Link href="/reports/job-profitability" className="font-medium text-primary underline-offset-4 hover:underline">
            Open customer and job profitability
          </Link>
          .
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Filters</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label htmlFor="job-consumption-from" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Date from
            </label>
            <Input
              id="job-consumption-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="job-consumption-to" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Date to
            </label>
            <Input id="job-consumption-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="button" className="w-full" onClick={() => void handleSearch()} disabled={loading}>
              {loading ? 'Generating…' : 'Generate report'}
            </Button>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Filter by jobs <span className="font-normal normal-case text-muted-foreground/80">(leave blank for all)</span>
          </label>
          <div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
            {jobs.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => toggleJob(j.id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  selectedJobs.includes(j.id)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {j.jobNumber}
              </button>
            ))}
          </div>
          {selectedJobs.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="mt-2 h-auto px-0 py-1 text-xs" onClick={() => setSelectedJobs([])}>
              Clear selection ({selectedJobs.length} selected)
            </Button>
          ) : null}
        </div>
      </section>

      {loading ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
          <Skeleton className="h-8 w-full max-w-md" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : hasSearched ? (
        <JobConsumptionTable rows={rows} onExport={handleExport} />
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
          Select your date range and click Generate report.
        </div>
      )}
    </div>
  );
}
