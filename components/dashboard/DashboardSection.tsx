import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';

export function DashboardSection({
  title,
  description,
  href,
  linkLabel,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {href && linkLabel ? (
          <Link href={href} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-fit')}>
            {linkLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
