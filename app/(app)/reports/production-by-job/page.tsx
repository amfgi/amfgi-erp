'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { useGetJobsQuery, useLazyGetProductionByJobQuery } from '@/store/hooks';
import { cn } from '@/lib/utils';

function formatQty(value: number) {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function pctOfTarget(produced: number, target: number | null) {
  if (target === null || target <= 0) return null;
  return Math.min(999, Math.round((produced / target) * 1000) / 10);
}

export default function ProductionByJobReportPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const { data: jobs = [] } = useGetJobsQuery(undefined, { skip: !canView });
  const [trigger, { data: rows = [], isLoading: loading }] = useLazyGetProductionByJobQuery();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const summary = useMemo(() => {
    const jobSet = new Set<string>();
    let total = 0;
    for (const r of rows) {
      jobSet.add(r.jobId);
      total += r.totalProduced;
    }
    return { jobCount: jobSet.size, lineCount: rows.length, totalProduced: total };
  }, [rows]);

  const handleSearch = async () => {
    setHasSearched(true);
    await trigger({ from: from || undefined, to: to || undefined, jobIds: selectedJobs });
  };

  const handleExport = () => {
    if (!rows.length) return;
    const headers = [
      'Job #',
      'Customer',
      'Site',
      'Budget line',
      'Tracker',
      'Unit',
      'Target',
      'Produced',
      '% of target',
      'Entries',
      'First date',
      'Last date',
    ];
    const csvRows = rows.map((r) => {
      const pct = pctOfTarget(r.totalProduced, r.targetValue);
      return [
        r.jobNumber,
        r.customerName,
        r.site ?? '',
        r.jobItemName,
        r.trackerLabel,
        r.unit ?? '',
        r.targetValue ?? '',
        r.totalProduced,
        pct === null ? '' : String(pct),
        r.entryCount,
        r.firstEntryDate ?? '',
        r.lastEntryDate ?? '',
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',');
    });
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production-by-job-${from || 'all'}-${to || 'all'}.csv`;
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
            <CardTitle>Production by job</CardTitle>
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Production by job</h1>
        <p className="text-sm text-muted-foreground">
          Totals from <strong className="font-medium text-foreground">production log</strong> progress entries — how much was
          recorded per job, budget line, and quantity tracker over a date range.
        </p>
        <p className="text-sm text-muted-foreground">
          Log daily quantities in{' '}
          <Link href="/stock/daily-quantity-log" className="font-medium text-primary underline-offset-4 hover:underline">
            Stock → Production log
          </Link>
          .
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Filters</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label htmlFor="prod-by-job-from" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Date from
            </label>
            <Input id="prod-by-job-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label htmlFor="prod-by-job-to" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Date to
            </label>
            <Input id="prod-by-job-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Results</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {rows.length === 0
                  ? 'No progress entries in this range.'
                  : `${summary.jobCount} job${summary.jobCount === 1 ? '' : 's'} · ${summary.lineCount} line${summary.lineCount === 1 ? '' : 's'} · ${formatQty(summary.totalProduced)} total quantity`}
              </p>
            </div>
            {rows.length > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={handleExport}>
                Export CSV
              </Button>
            ) : null}
          </div>
          {rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <Th>Job #</Th>
                    <Th>Customer</Th>
                    <Th>Site</Th>
                    <Th>Budget line</Th>
                    <Th>Tracker</Th>
                    <Th align="right">Target</Th>
                    <Th align="right">Produced</Th>
                    <Th align="right">% target</Th>
                    <Th align="right">Entries</Th>
                    <Th>First</Th>
                    <Th>Last</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const pct = pctOfTarget(r.totalProduced, r.targetValue);
                    return (
                      <tr key={`${r.jobId}-${r.jobItemId}-${r.trackerId ?? 'none'}`} className="hover:bg-muted/40">
                        <Td className="whitespace-nowrap font-medium text-foreground">{r.jobNumber}</Td>
                        <Td className="max-w-40 truncate">{r.customerName}</Td>
                        <Td className="max-w-32 truncate text-muted-foreground">{r.site ?? '—'}</Td>
                        <Td className="max-w-48 truncate">{r.jobItemName}</Td>
                        <Td className="max-w-40 truncate">{r.trackerLabel}</Td>
                        <Td align="right" className="tabular-nums text-muted-foreground">
                          {r.targetValue !== null && r.targetValue > 0 ? formatQty(r.targetValue) : '—'}
                        </Td>
                        <Td align="right" className="tabular-nums font-medium text-foreground">
                          {formatQty(r.totalProduced)}
                          {r.unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{r.unit}</span> : null}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          {pct === null ? <span className="text-muted-foreground">—</span> : <span>{pct}%</span>}
                        </Td>
                        <Td align="right" className="tabular-nums text-muted-foreground">
                          {r.entryCount}
                        </Td>
                        <Td className="whitespace-nowrap text-xs text-muted-foreground">{r.firstEntryDate ?? '—'}</Td>
                        <Td className="whitespace-nowrap text-xs text-muted-foreground">{r.lastEntryDate ?? '—'}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
          Select your date range and click Generate report.
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Compare with{' '}
        <Link href="/reports/job-consumption" className="font-medium text-primary underline-offset-4 hover:underline">
          Job consumption
        </Link>{' '}
        for issued materials, or{' '}
        <Link href="/reports/job-profitability" className="font-medium text-primary underline-offset-4 hover:underline">
          Job profitability
        </Link>{' '}
        for margin context.
      </p>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
        align === 'right' && 'text-right',
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  className,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td className={cn('px-3 py-2.5 align-middle', align === 'right' && 'text-right', className)}>{children}</td>
  );
}
