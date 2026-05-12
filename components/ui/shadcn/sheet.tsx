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

const SheetContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & { side?: 'top' | 'bottom' | 'left' | 'right' }
>(function SheetContent({ side = 'right', className, style, children, ...props }, ref) {
  const { open, setOpen } = useSheetContext('SheetContent');
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open || !mounted) return;
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
  }, [open, mounted, setOpen]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
        aria-label="Close sheet"
        onClick={() => setOpen(false)}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        style={style}
        className={cn(
          'fixed z-51 flex max-h-dvh flex-col overflow-hidden bg-background p-6 shadow-xl',
          sheetSideClass[side],
          className,
        )}
        onPointerDown={(e) => e.stopPropagation()}
        {...props}
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
