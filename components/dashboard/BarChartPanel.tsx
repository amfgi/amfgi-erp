import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { cn } from '@/lib/utils';

export type BarChartItem = {
  id?: string;
  label: string;
  value: number;
  displayValue?: string;
  tone?: 'emerald' | 'sky' | 'amber' | 'violet' | 'rose' | 'muted';
};

const barToneClass: Record<NonNullable<BarChartItem['tone']>, string> = {
  emerald: 'bg-emerald-500/80',
  sky: 'bg-sky-500/80',
  amber: 'bg-amber-500/80',
  violet: 'bg-violet-500/80',
  rose: 'bg-rose-500/80',
  muted: 'bg-muted-foreground/50',
};

function defaultFormat(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function BarChartBars({
  items,
  emptyMessage = 'No data for this period.',
  valueFormatter = defaultFormat,
}: {
  items: BarChartItem[];
  emptyMessage?: string;
  valueFormatter?: (value: number) => string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  if (items.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item, index) => {
        const widthPct = Math.max(4, Math.round((item.value / max) * 100));
        const tone = item.tone ?? 'sky';
        return (
          <li key={item.id ?? `${item.label}-${index}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-foreground">{item.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {item.displayValue ?? valueFormatter(item.value)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted/60">
              <div
                className={cn('h-full rounded-full transition-[width]', barToneClass[tone])}
                style={{ width: `${widthPct}%` }}
                role="presentation"
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function BarChartPanel({
  title,
  description,
  items,
  loading,
  emptyMessage = 'No data for this period.',
  valueFormatter = defaultFormat,
  headerAction,
}: {
  title: string;
  description?: string;
  items: BarChartItem[];
  loading?: boolean;
  emptyMessage?: string;
  valueFormatter?: (value: number) => string;
  headerAction?: ReactNode;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="gap-1 pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {headerAction}
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <BarChartBars items={items} emptyMessage={emptyMessage} valueFormatter={valueFormatter} />
        )}
      </CardContent>
    </Card>
  );
}
