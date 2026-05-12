'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';

import { isEmployeeSelfServiceUser } from '@/lib/auth/selfService';
import { APP_NAV_ITEMS, filterVisibleNavItems, type AppNavItem } from '@/lib/navigation/appNavigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/shadcn/alert';
import { buttonVariants } from '@/components/ui/shadcn/button';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { cn } from '@/lib/utils';

const CATEGORY_ORDER = [
  'Operations',
  'Master Data',
  'People',
  'Insights',
  'Administration',
] as const satisfies ReadonlyArray<AppNavItem['category']>;

const SECTION_COPY: Record<AppNavItem['category'], { summary: string }> = {
  'Master Data': {
    summary: 'Customers, suppliers, jobs, and core records.',
  },
  Operations: {
    summary: 'Stock, receipts, dispatch, and live processing.',
  },
  People: {
    summary: 'Employees, attendance, and HR workflows.',
  },
  Insights: {
    summary: 'Reports and consumption review.',
  },
  Administration: {
    summary: 'Settings, roles, and system controls.',
  },
};

const DASHBOARD_SCROLL_KEY = 'workspace-home-scroll';
const DASHBOARD_RESTORE_KEY = 'workspace-home-restore';

function rememberScrollPosition() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(DASHBOARD_SCROLL_KEY, String(window.scrollY));
  window.sessionStorage.setItem(DASHBOARD_RESTORE_KEY, '1');
}

export default function DashboardPage() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldRestore = window.sessionStorage.getItem(DASHBOARD_RESTORE_KEY);
    const savedScroll = window.sessionStorage.getItem(DASHBOARD_SCROLL_KEY);
    if (shouldRestore === '1' && savedScroll) {
      window.sessionStorage.removeItem(DASHBOARD_RESTORE_KEY);
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: Number(savedScroll), behavior: 'auto' });
      });
    }
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2 border-b border-border pb-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-64 max-w-full sm:w-96" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="bg-muted/30 px-4 py-2.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-1 h-3 w-full" />
              </div>
              <div className="flex flex-col divide-y divide-border">
                <div className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="size-9 shrink-0 rounded-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-40 max-w-[85%]" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="size-9 shrink-0 rounded-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-32 max-w-[75%]" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!session?.user) {
    redirect('/login');
  }

  if (isEmployeeSelfServiceUser(session.user)) {
    redirect('/me/profile');
  }

  if (!session.user.activeCompanyId) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        <div className="rounded-lg border border-border bg-card px-5 py-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workspace</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Select a company</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Choose an active company from the header to load modules for that workspace.
          </p>
          <Link href="/select-company" className={cn(buttonVariants({ variant: 'default' }), 'mt-4 inline-flex')}>
            Company selection
          </Link>
        </div>
        <Alert>
          <AlertTitle>No active company</AlertTitle>
          <AlertDescription>Use the company switcher in the top bar.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const visibleItems = filterVisibleNavItems(APP_NAV_ITEMS, {
    permissions: session.user.permissions ?? [],
    isSuperAdmin: session.user.isSuperAdmin ?? false,
    linkedEmployeeId: session.user.linkedEmployeeId,
    selfServiceOnly: false,
  }).filter((item) => item.href !== '/dashboard');

  const groupedItems = CATEGORY_ORDER.map((category) => ({
    category,
    items: visibleItems.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  const companyName = session.user.activeCompanyName || 'Company workspace';

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Home</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{companyName}</h1>
          <p className="text-sm text-muted-foreground">Select a module from the lists below.</p>
        </div>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground sm:pb-0.5">
          {visibleItems.length} module{visibleItems.length === 1 ? '' : 's'}
        </p>
      </header>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groupedItems.map((group) => (
          <section
            key={group.category}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm"
            aria-labelledby={`cat-${group.category}`}
          >
            <div className="flex flex-col gap-0.5 bg-muted/30 px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 id={`cat-${group.category}`} className="text-sm font-semibold text-foreground">
                  {group.category}
                </h2>
                <span className="text-xs tabular-nums text-muted-foreground">{group.items.length}</span>
              </div>
              <p className="text-xs leading-snug text-muted-foreground">{SECTION_COPY[group.category].summary}</p>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-border" role="list">
              {group.items.map((item) => (
                <li key={item.href} role="listitem">
                  <Link
                    href={item.href}
                    onClick={rememberScrollPosition}
                    className={cn(
                      'flex min-h-13 items-center gap-3 px-4 py-2.5 transition-colors',
                      'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground [&_svg]:size-5">
                      {item.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                        <span className="text-sm font-medium text-foreground">{item.shortTitle}</span>
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground" aria-hidden>
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
