'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import MaterialConsumptionTable from '@/components/reports/MaterialConsumptionTable';
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
import { useLazyGetMaterialConsumptionQuery } from '@/store/hooks';

type MaterialLabelMode = 'name' | 'external';

function defaultThisMonthRange() {
  return getDateRangeForPreset('this_month') ?? { from: '', to: '' };
}

function buildQueryString(
  from: string,
  to: string,
  materialLabel: MaterialLabelMode,
  format?: 'json' | 'xlsx',
) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('materialLabel', materialLabel);
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

export default function MaterialConsumptionPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const [triggerGetReport, { data: report, isLoading, isFetching }] = useLazyGetMaterialConsumptionQuery();

  const initialRange = defaultThisMonthRange();
  const [datePreset, setDatePreset] = useState<DateRangePreset>('this_month');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [materialLabel, setMaterialLabel] = useState<MaterialLabelMode>('name');
  const [hasGenerated, setHasGenerated] = useState(false);
  const [downloading, setDownloading] = useState(false);

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

  const reportParams = {
    from: from || null,
    to: to || null,
    materialLabel,
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
      const query = buildQueryString(from, to, materialLabel, 'xlsx');
      const filename =
        !from && !to
          ? 'material-consumption-all-dates.xlsx'
          : `material-consumption-${from || 'start'}-${to || 'end'}.xlsx`;
      await downloadExcel(`/api/reports/material-consumption?${query}`, filename);
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
          <CardTitle>Material consumption</CardTitle>
          <CardDescription>You do not have permission to view this report.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const loading = isLoading || isFetching;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Insights</p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Material consumption</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Choose a date range and generate. Stock outs and returns are rolled up by material with net quantity and cost.
          Export one Excel sheet for the period.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Report options</h2>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label
              htmlFor="material-consumption-date-preset"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Date range
            </label>
            <Select
              id="material-consumption-date-preset"
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
            <label
              htmlFor="material-consumption-from"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              From
            </label>
            <Input
              id="material-consumption-from"
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
            <label
              htmlFor="material-consumption-to"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              To
            </label>
            <Input
              id="material-consumption-to"
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
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Material label</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMaterialLabel('name');
                  setHasGenerated(false);
                }}
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
                onClick={() => {
                  setMaterialLabel('external');
                  setHasGenerated(false);
                }}
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
      ) : hasGenerated && report ? (
        <MaterialConsumptionTable
          report={report}
          onDownload={() => void handleDownload()}
          downloading={downloading}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
          Select a date range, choose material labeling, then click Generate report. Excel download lists Material,
          Unit, Net Qty, Unit Cost, and Net Cost for {dateRangeLabel}.
        </div>
      )}
    </div>
  );
}
