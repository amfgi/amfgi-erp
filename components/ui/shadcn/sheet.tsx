'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

type SheetContextValue = {
  open: boolean;
  setOpen: (next: boolean) => void;
};

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext(component: string) {
  const ctx = React.useContext(SheetContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <Sheet>.`);
  }
  return ctx;
}

type SheetProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<'div'>, 'children'>;

const Sheet = React.forwardRef<HTMLDivElement, SheetProps>(function Sheet(
  { open = false, onOpenChange, children, className, ...props },
  ref,
) {
  const setOpen = React.useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const value = React.useMemo(() => ({ open, setOpen }), [open, setOpen]);

  return (
    <SheetContext.Provider value={value}>
      <div ref={ref} className={cn('contents', className)} {...props}>
        {children}
      </div>
    </SheetContext.Provider>
  );
});
Sheet.displayName = 'Sheet';

function SheetPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const SheetOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function SheetOverlay({ className, ...props }, ref) {
    return <div ref={ref} role="presentation" className={cn('fixed inset-0 z-50 bg-black/60 backdrop-blur-sm', className)} {...props} />;
  },
);
SheetOverlay.displayName = 'SheetOverlay';

function SheetTrigger({ children, onClick, ...props }: React.ComponentPropsWithoutRef<'button'>) {
  const { setOpen } = useSheetContext('SheetTrigger');
  return (
    <button
      type="button"
      {...props}
      onClick={(e) => {
        onClick?.(e);
        setOpen(true);
      }}
    >
      {children}
    </button>
  );
}

function SheetClose({ children, onClick, ...props }: React.ComponentPropsWithoutRef<'button'>) {
  const { setOpen } = useSheetContext('SheetClose');
  return (
    <button
      type="button"
      {...props}
      onClick={(e) => {
        onClick?.(e);
        setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

const sheetSideClass: Record<'top' | 'bottom' | 'left' | 'right', string> = {
  top: 'inset-x-0 top-0 max-h-[88vh] border-b',
  bottom: 'inset-x-0 bottom-0 max-h-[88vh] border-t',
  left: 'inset-y-0 left-0 h-full rounded-r-2xl border-r shadow-2xl shadow-black/25',
  right: 'inset-y-0 right-0 h-full rounded-l-2xl border-l shadow-2xl shadow-black/25',
};

const SHEET_TRANSITION_MS = 300;

function sheetExitTranslate(side: 'top' | 'bottom' | 'left' | 'right'): string {
  switch (side) {
    case 'left':
      return '-translate-x-full';
    case 'right':
      return 'translate-x-full';
    case 'top':
      return '-translate-y-full';
    default:
      return 'translate-y-full';
  }
}

const SheetContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & { side?: 'top' | 'bottom' | 'left' | 'right' }
>(function SheetContent({ side = 'right', className, style, children, ...props }, ref) {
  const { open, setOpen } = useSheetContext('SheetContent');
  const [mounted, setMounted] = React.useState(false);
  const [present, setPresent] = React.useState(open);
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useLayoutEffect(() => {
    if (open) {
      setPresent(true);
    }
  }, [open]);

  React.useEffect(() => {
    if (!mounted) return;

    if (open) {
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setEntered(true));
      });
      return () => window.cancelAnimationFrame(id);
    }

    setEntered(false);
    const timer = window.setTimeout(() => setPresent(false), SHEET_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  React.useEffect(() => {
    if (!mounted || (!open && !present)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, present, mounted, setOpen]);

  if (!mounted || (!present && !open)) return null;

  const exitT = sheetExitTranslate(side);

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className={cn(
          'absolute inset-0 bg-slate-950/55 backdrop-blur-sm transition-opacity duration-300 ease-out motion-reduce:transition-none',
          entered ? 'opacity-100' : 'opacity-0',
        )}
        aria-label="Close sheet"
        onClick={() => setOpen(false)}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed z-51 flex max-h-dvh flex-col overflow-hidden bg-background p-6 shadow-xl transition-transform duration-300 ease-out motion-reduce:transition-none',
          'motion-reduce:translate-x-0 motion-reduce:translate-y-0',
          sheetSideClass[side],
          entered ? 'translate-x-0 translate-y-0' : exitT,
          className,
        )}
        onPointerDown={(e) => e.stopPropagation()}
        {...props}
        style={{
          ...((props as { style?: React.CSSProperties }).style as React.CSSProperties | undefined),
          ...(typeof style === 'object' && style !== null ? style : {}),
          transitionDuration: `${SHEET_TRANSITION_MS}ms`,
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
});
SheetContent.displayName = 'SheetContent';

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />;
}

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  function SheetTitle({ className, ...props }, ref) {
    return <h2 ref={ref} className={cn('text-lg font-semibold text-foreground', className)} {...props} />;
  },
);
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function SheetDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
  },
);
SheetDescription.displayName = 'SheetDescription';

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
