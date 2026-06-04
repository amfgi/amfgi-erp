'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import AppNavigationSidebar from '@/components/layout/Sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/shadcn/sidebar';

const SIDEBAR_COLLAPSED_KEY = 'amfgi-sidebar-collapsed';
const SCROLL_STATE_KEY_PREFIX = 'amfgi-scroll:';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const isEmployeePortalRoute = pathname?.startsWith('/me') ?? false;
  const isChromelessRoute = isEmployeePortalRoute;
  const routeScrollKey = useMemo(() => {
    const query = searchParams?.toString();
    return `${SCROLL_STATE_KEY_PREFIX}${pathname || '/'}${query ? `?${query}` : ''}`;
  }, [pathname, searchParams]);

  const persistCollapsed = useCallback((collapsed: boolean) => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const handleSidebarOpenChange = useCallback(
    (open: boolean) => {
      const collapsed = !open;
      setDesktopCollapsed(collapsed);
      persistCollapsed(collapsed);
    },
    [persistCollapsed],
  );

  useEffect(() => {
    let frame = 0;
    try {
      const nextCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
      frame = window.requestAnimationFrame(() => {
        setDesktopCollapsed(nextCollapsed);
      });
    } catch {
      frame = window.requestAnimationFrame(() => {
        setDesktopCollapsed(false);
      });
    }
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const persistScroll = () => {
      try {
        sessionStorage.setItem(routeScrollKey, String(main.scrollTop));
      } catch {
        /* ignore */
      }
    };

    persistScroll();
    main.addEventListener('scroll', persistScroll, { passive: true });
    window.addEventListener('beforeunload', persistScroll);

    return () => {
      persistScroll();
      main.removeEventListener('scroll', persistScroll);
      window.removeEventListener('beforeunload', persistScroll);
    };
  }, [routeScrollKey]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    let nextScrollTop = 0;

    try {
      const raw = sessionStorage.getItem(routeScrollKey);
      if (raw) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= 0) {
          nextScrollTop = parsed;
        }
      }
    } catch {
      nextScrollTop = 0;
    }

    const frame = window.requestAnimationFrame(() => {
      main.scrollTo({ top: nextScrollTop, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [routeScrollKey]);

  if (isChromelessRoute) {
    return (
      <div className="flex min-h-dvh h-dvh max-h-dvh overflow-hidden bg-background lg:h-screen lg:max-h-none">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main ref={mainRef} className="relative z-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.08),transparent)]" aria-hidden />
            <div className="relative w-full">{children}</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      className="flex min-h-dvh h-dvh max-h-dvh overflow-hidden bg-background lg:h-screen lg:max-h-none"
      open={!desktopCollapsed}
      onOpenChange={handleSidebarOpenChange}
    >
      <AppNavigationSidebar />
      <SidebarInset className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <Header />
        <main ref={mainRef} className="relative z-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.08),transparent)]"
            aria-hidden
          />
          <div className="relative mx-auto w-full max-w-[1680px] px-4 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-6">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
