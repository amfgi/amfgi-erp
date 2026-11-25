'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { buildBreadcrumbs, type BreadcrumbCrumb } from '@/lib/navigation/breadcrumbs';
import { useBreadcrumbOverride } from '@/components/layout/BreadcrumbLabel';

type VisibleCrumb = BreadcrumbCrumb & { ellipsis?: boolean };

function visibleCrumbs(crumbs: BreadcrumbCrumb[], narrow: boolean): VisibleCrumb[] {
  if (!narrow || crumbs.length <= 3) return crumbs;
  return [
    crumbs[0],
    { href: '', label: '…', link: false, ellipsis: true },
    crumbs[crumbs.length - 2],
    crumbs[crumbs.length - 1],
  ];
}

export default function AppBreadcrumb() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const override = useBreadcrumbOverride();
  const [narrow, setNarrow] = useState(false);
  const searchKey = searchParams?.toString() ?? '';

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const crumbs = useMemo(() => {
    const built = buildBreadcrumbs(pathname, new URLSearchParams(searchKey));
    if (!override || built.length === 0) return built;
    return built.map((crumb, index) =>
      index === built.length - 1 ? { ...crumb, label: override } : crumb,
    );
  }, [override, pathname, searchKey]);

  if (crumbs.length === 0) return null;

  const items = visibleCrumbs(crumbs, narrow);

  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex min-w-0 items-center gap-1 overflow-x-auto text-xs leading-none text-muted-foreground">
      {items.map((crumb, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${crumb.href}-${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 ? <ChevronRight className="size-3 shrink-0 text-muted-foreground/70" aria-hidden /> : null}
            {crumb.ellipsis || !crumb.link ? (
              <span
                className={last ? 'truncate font-medium text-foreground' : 'truncate text-muted-foreground/80'}
                aria-current={last ? 'page' : undefined}
              >
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="truncate text-muted-foreground hover:text-foreground">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
