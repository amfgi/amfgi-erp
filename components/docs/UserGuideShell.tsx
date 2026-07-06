'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { USER_GUIDE_PAGES } from '@/lib/docs/userGuide';

type DocsTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'amfgi-user-guide-theme';

const NAV_PAGES = [...USER_GUIDE_PAGES].sort((a, b) => a.order - b.order);

export function UserGuideShell({
  children,
  activeSlug,
}: {
  children: ReactNode;
  activeSlug?: string;
}) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<DocsTheme>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as DocsTheme | null;
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previous = {
      rootDark: root.classList.contains('dark'),
      rootLight: root.classList.contains('light'),
      bodyDark: body.classList.contains('dark'),
      bodyLight: body.classList.contains('light'),
      dataTheme: root.dataset.theme,
      colorScheme: root.style.colorScheme,
    };
    const isLight = theme === 'light';
    const isDark = theme === 'dark';

    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.classList.toggle('light', isLight);
    root.classList.toggle('dark', isDark);
    body.classList.toggle('light', isLight);
    body.classList.toggle('dark', isDark);

    return () => {
      root.classList.toggle('dark', previous.rootDark);
      root.classList.toggle('light', previous.rootLight);
      body.classList.toggle('dark', previous.bodyDark);
      body.classList.toggle('light', previous.bodyLight);
      if (previous.dataTheme) {
        root.dataset.theme = previous.dataTheme;
      } else {
        delete root.dataset.theme;
      }
      root.style.colorScheme = previous.colorScheme;
    };
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  };

  const isIndex = pathname === '/docs';

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div
        data-native-context-menu="true"
        data-user-select="text"
        className="allow-text-select min-h-screen bg-[#f7f4ed] text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      >
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#f7f4ed]/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/86">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <Link href="/docs" className="group flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-sm font-black text-white shadow-lg shadow-slate-900/20 transition group-hover:scale-105 dark:bg-amber-300 dark:text-slate-950">
                ERP
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-950 dark:text-white">AMFGI User Guide</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Module documentation for daily operations</span>
              </span>
            </Link>
            <nav className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href="/dashboard"
                className="rounded-full px-3 py-2 text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
              >
                Open app
              </Link>
              <Link
                href="/docs/api"
                className="rounded-full px-3 py-2 text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
              >
                API docs
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-amber-300 hover:text-amber-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-amber-500 dark:hover:text-amber-300"
              >
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            </nav>
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:py-10">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Modules</p>
            <nav className="flex flex-row gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
              <Link
                href="/docs"
                className={cn(
                  'shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition',
                  isIndex
                    ? 'bg-slate-900 text-white dark:bg-amber-300 dark:text-slate-950'
                    : 'text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white',
                )}
              >
                Overview
              </Link>
              {NAV_PAGES.map((page) => {
                const active = activeSlug === page.slug;
                return (
                  <Link
                    key={page.slug}
                    href={`/docs/${page.slug}`}
                    className={cn(
                      'shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition',
                      active
                        ? 'bg-slate-900 text-white dark:bg-amber-300 dark:text-slate-950'
                        : 'text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white',
                    )}
                  >
                    {page.title}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
