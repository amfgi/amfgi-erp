'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import MonthlyJobSummaryTable from '@/components/reports/MonthlyJobSummaryTable';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import {
  DATE_RANGE_PRESET_OPTIONS,
  getDateRangeForPreset,
  type DateRangePreset,
} from '@/lib/reports/dateRangePresets';
import { cn } from '@/lib/utils';
import { useLazyGetMonthlyJobSummaryQuery } from '@/store/hooks';

type MaterialLabelMode = 'name' | 'external';
type JobGroupBy = 'parent' | 'variation';

type IncludeOptions = {
  consumption: boolean;
  production: boolean;
  costing: boolean;
  workHours: boolean;
};

function defaultThisMonthRange() {
  return getDateRangeForPreset('this_month') ?? { from: '', to: '' };
}

function buildQueryString(
  from: string,
  to: string,
  groupBy: JobGroupBy,
  materialLabel: MaterialLabelMode,
  include: IncludeOptions,
  format?: 'json' | 'xlsx',
) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('groupBy', groupBy);
  params.set('materialLabel', materialLabel);
  if (!include.consumption) params.set('includeConsumption', 'false');
  if (!include.production) params.set('includeProduction', 'false');
  if (!include.costing) params.set('includeCosting', 'false');
  if (!include.workHours) params.set('includeWorkHours', 'false');
  if (format) params.set('format', format);
  return params.toString();
}

async function downloadExcel(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) {
    let message = 'Download failed';
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      const text = await response.text();
      if (text) message = text;
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export default function MonthlyJobSummaryPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const [triggerGetReport, { data: report, isLoading, isFetching }] = useLazyGetMonthlyJobSummaryQuery();

  const initialRange = defaultThisMonthRange();
  const [datePreset, setDatePreset] = useState<DateRangePreset>('this_month');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [groupBy, setGroupBy] = useState<JobGroupBy>('parent');
  const [materialLabel, setMaterialLabel] = useState<MaterialLabelMode>('name');
  const [include, setInclude] = useState<IncludeOptions>({
    consumption: true,
    production: true,
    costing: true,
    workHours: true,
  });
  const [hasGenerated, setHasGenerated] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const includeCount = useMemo(
    () => Object.values(include).filter(Boolean).length,
    [include],
  );

  const dateRangeLabel = useMemo(() => {
    if (!from && !to) return 'All dates';
    if (from && to) return `${from} to ${to}`;
    if (from) return `From ${from}`;
    return `Until ${to}`;
  }, [from, to]);

  const applyPreset = (preset: DateRangePreset) => {
    setDatePreset(preset);
    if (preset === 'custom') return;
    const range = getDateRangeForPreset(preset);
    if (!range) {
      setFrom('');
      setTo('');
      return;
    }
    setFrom(range.from);
    setTo(range.to);
  };

  const toggleInclude = (key: keyof IncludeOptions) =>
    setInclude((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.consumption && !next.production && !next.costing && !next.workHours) {
        return prev;
      }
      return next;
    });

  const reportParams = {
    from: from || null,
    to: to || null,
    groupBy,
    materialLabel,
    includeConsumption: include.consumption,
    includeProduction: include.production,
    includeCosting: include.costing,
    includeWorkHours: include.workHours,
  };

  const handleGenerate = async () => {
    setHasGenerated(true);
    try {
      await triggerGetReport(reportParams).unwrap();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate report');
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const query = buildQueryString(from, to, groupBy, materialLabel, include, 'xlsx');
      const filename =
        !from && !to ? 'job-summary-all-dates.xlsx' : `job-summary-${from || 'start'}-${to || 'end'}.xlsx`;
      await downloadExcel(`/api/reports/monthly-job-summary?${query}`, filename);
      toast.success('Excel downloaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download Excel');
    } finally {
      setDownloading(false);
    }
  };

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly job summary</CardTitle>
          <CardDescription>You do not have permission to view this report.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const loading = isLoading || isFetching;
  const sheets = report?.sheets ?? [];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Insights</p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Monthly job summary</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Choose a date range and generate. Jobs with stock transactions or work assignments in that period are listed
          automatically. Export one Excel sheet per parent job or per variation.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Report options</h2>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label htmlFor="job-summary-date-preset" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Date range
            </label>
            <Select
              id="job-summary-date-preset"
              value={datePreset}
              onChange={(e) => {
                applyPreset(e.target.value as DateRangePreset);
                setHasGenerated(false);
              }}
            >
              {DATE_RANGE_PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="job-summary-from" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              From
            </label>
            <Input
              id="job-summary-from"
              type="date"
              value={from}
              disabled={datePreset === 'all'}
              onChange={(e) => {
                setFrom(e.target.value);
                setDatePreset('custom');
                setHasGenerated(false);
              }}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="job-summary-to" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              To
            </label>
            <Input
              id="job-summary-to"
              type="date"
              value={to}
              disabled={datePreset === 'all'}
              onChange={(e) => {
                setTo(e.target.value);
                setDatePreset('custom');
                setHasGenerated(false);
              }}
            />
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Job grouping</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setGroupBy('parent');
                  setHasGenerated(false);
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  groupBy === 'parent'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                Parent job
              </button>
              <button
                type="button"
                onClick={() => {
                  setGroupBy('variation');
                  setHasGenerated(false);
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  groupBy === 'variation'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                Variation job
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Material label</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMaterialLabel('name')}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  materialLabel === 'name'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                Material name
              </button>
              <button
                type="button"
                onClick={() => setMaterialLabel('external')}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  materialLabel === 'external'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                External name (fallback to material name)
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Include in export</p>
            <div className="flex flex-wrap gap-2">
              {([
                ['consumption', 'Consumption'],
                ['production', 'Production'],
                ['costing', 'Costing'],
                ['workHours', 'Work hours'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleInclude(key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    include[key]
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {includeCount} section{includeCount === 1 ? '' : 's'} selected. Excel consumption uses Material, Unit, Net
              Qty, Unit Cost, Net Cost.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-border pt-5">
          <Button type="button" onClick={() => void handleGenerate()} disabled={loading}>
            {loading ? 'Generating…' : 'Generate report'}
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
          <Skeleton className="h-8 w-full max-w-md" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : hasGenerated ? (
        <MonthlyJobSummaryTable
          dateRangeLabel={report?.dateRangeLabel ?? dateRangeLabel}
          groupBy={report?.groupBy ?? groupBy}
          sheets={sheets}
          include={include}
          onDownload={() => void handleDownload()}
          downloading={downloading}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
          Select a month, choose your options, then click Generate report. Excel download includes a Summary index
          sheet linked to each job sheet.
        </div>
      )}

    </div>
  );
}
