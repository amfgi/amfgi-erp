import Link from 'next/link';

import { Badge } from '@/components/ui/shadcn/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { buttonVariants } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';

export type DashboardFeedBadgeTone = 'amber' | 'emerald' | 'sky' | 'rose' | 'muted';

export type DashboardFeedItem = {
  key: string;
  primary: string;
  secondary?: string;
  meta?: string;
  href?: string;
  badge?: { label: string; tone?: DashboardFeedBadgeTone };
};

const badgeToneClass: Record<DashboardFeedBadgeTone, string> = {
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300',
  muted: 'border-border bg-muted/40 text-muted-foreground',
};

function FeedRow({ item }: { item: DashboardFeedItem }) {
  const content = (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.primary}</p>
        {item.secondary ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.secondary}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {item.badge ? (
          <Badge variant="outline" className={cn('text-[10px] font-medium', badgeToneClass[item.badge.tone ?? 'muted'])}>
            {item.badge.label}
          </Badge>
        ) : null}
        {item.meta ? <span className="text-[11px] tabular-nums text-muted-foreground">{item.meta}</span> : null}
      </div>
    </div>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        className="block transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </Link>
    );
  }

  return content;
}

export function DashboardFeedPanel({
  title,
  description,
  emptyMessage,
  loading,
  href,
  linkLabel,
  items,
}: {
  title: string;
  description?: string;
  emptyMessage: string;
  loading?: boolean;
  href?: string;
  linkLabel?: string;
  items: DashboardFeedItem[];
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="gap-1 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {href && linkLabel ? (
            <Link href={href} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}>
              {linkLabel}
            </Link>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0 pt-0">
        {loading ? (
          <div className="space-y-2 px-4 pb-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <FeedRow key={item.key} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
