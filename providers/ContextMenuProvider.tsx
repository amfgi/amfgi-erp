'use client';

import { useEffect, useState, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  options: ContextMenuOption[];
}

interface ContextMenuContextType {
  isOpen: boolean;
  x: number;
  y: number;
  options: ContextMenuOption[];
  openMenu: (x: number, y: number, options: ContextMenuOption[], pageHref?: string) => void;
  closeMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextType | undefined>(undefined);

export function useGlobalContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useGlobalContextMenu must be used within ContextMenuProvider');
  }
  return context;
}

function isInternalPageHref(raw: string | null | undefined) {
  if (!raw || typeof window === 'undefined') return null;
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('javascript:')
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed, window.location.origin);
  } catch {
    return null;
  }

  if (url.origin !== window.location.origin) return null;
  const path = url.pathname;
  if (
    path.startsWith('/api/') ||
    path.startsWith('/print') ||
    path.includes('-print') ||
    path.startsWith('/settings/print-template')
  ) {
    return null;
  }
  if (path === window.location.pathname) return null;
  return `${path}${url.search}${url.hash}`;
}

function resolvePageHref(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return null;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return null;
  if (target.closest('[data-native-context-menu="true"]')) return null;
  if (target.closest('[data-radix-context-menu-trigger]')) return null;

  const marked = target.closest<HTMLElement>('[data-nav-href]')?.getAttribute('data-nav-href');
  if (marked) return isInternalPageHref(marked);

  const anchor = target.closest<HTMLAnchorElement>('a[href]')?.getAttribute('href');
  return isInternalPageHref(anchor);
}

function navigationOptions(href: string, push: (href: string) => void): ContextMenuOption[] {
  return [
    { label: 'Open', action: () => push(href) },
    {
      label: 'Open in new tab',
      action: () => {
        window.open(href, '_blank', 'noopener,noreferrer');
      },
    },
  ];
}

function withPageNavigation(
  options: ContextMenuOption[],
  pageHref: string | undefined,
  push: (href: string) => void,
) {
  const href = isInternalPageHref(pageHref);
  if (!href) return options;
  const items = navigationOptions(href, push);
  const openInNewTab = items.find((option) => option.label === 'Open in new tab');
  const hasOpen = options.some((option) => option.label === 'Open');
  if (options.length === 0) return items;
  if (hasOpen && openInNewTab) {
    const next: ContextMenuOption[] = [];
    for (const option of options) {
      next.push(option);
      if (option.label === 'Open') next.push(openInNewTab);
    }
    return next;
  }
  return [...items, { divider: true }, ...options];
}

interface Props {
  children: ReactNode;
}

export function ContextMenuProvider({ children }: Props) {
  const router = useRouter();
  const openedForEvent = useRef(false);
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    options: [],
  });

  const openMenu = useCallback(
    (x: number, y: number, options: ContextMenuOption[], pageHref?: string) => {
      openedForEvent.current = true;
      setState({
        isOpen: true,
        x,
        y,
        options: withPageNavigation(options, pageHref, (href) => router.push(href)),
      });
    },
    [router],
  );

  const closeMenu = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
    }));
  }, []);

  useEffect(() => {
    const resetOpened = () => {
      openedForEvent.current = false;
    };

    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-native-context-menu="true"]')) return;
      if (!target?.hasAttribute('data-context-menu')) {
        event.preventDefault();
      }
    };

    const openPageMenu = (event: MouseEvent) => {
      if (openedForEvent.current) return;
      const href = resolvePageHref(event.target);
      if (!href) return;
      event.preventDefault();
      openMenu(event.clientX, event.clientY, [], href);
    };

    document.addEventListener('contextmenu', resetOpened, true);
    document.addEventListener('contextmenu', handleContextMenu, false);
    document.addEventListener('contextmenu', openPageMenu, false);

    return () => {
      document.removeEventListener('contextmenu', resetOpened, true);
      document.removeEventListener('contextmenu', handleContextMenu, false);
      document.removeEventListener('contextmenu', openPageMenu, false);
    };
  }, [openMenu]);

  const value: ContextMenuContextType = {
    ...state,
    openMenu,
    closeMenu,
  };

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
      {state.isOpen && (
        <ContextMenu
          x={state.x}
          y={state.y}
          options={state.options}
          onClose={closeMenu}
        />
      )}
    </ContextMenuContext.Provider>
  );
}
