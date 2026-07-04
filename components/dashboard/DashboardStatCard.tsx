import Link from 'next/link';

import { cn } from '@/lib/utils';

export function DashboardStatCard({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'amber' | 'emerald' | 'sky' | 'rose' | 'violet';
  href?: string;
}) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-500/20 bg-amber-500/5'
      : tone === 'emerald'
        ? 'border-emerald-500/20 bg-emerald-500/5'
        : tone === 'sky'
          ? 'border-sky-500/20 bg-sky-500/5'
          : tone === 'rose'
            ? 'border-rose-500/20 bg-rose-500/5'
            : tone === 'violet'
              ? 'border-violet-500/20 bg-violet-500/5'
              : 'border-border bg-card';

  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          'block rounded-xl border p-4 transition-colors hover:border-foreground/20 hover:bg-muted/30',
          toneClass,
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={cn('rounded-xl border p-4', toneClass)}>{body}</div>;
}
