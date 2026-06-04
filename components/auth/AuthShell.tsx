import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function AuthBrand() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
        <span className="text-xl font-bold text-primary-foreground">A</span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">AMFGI ERP</h1>
      <p className="mt-1 text-sm text-muted-foreground">Almuraqib Fiber Glass Industry</p>
    </div>
  );
}

export function AuthShell({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.18),transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-primary/5 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-24 bottom-1/4 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl"
        aria-hidden
      />

      <div className={cn('relative z-10 w-full max-w-md', className)}>
        <AuthBrand />
        <div className="mt-8">{children}</div>
        {footer ?? (
          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <Link href="/privacy-policy" className="transition-colors hover:text-primary">
              Privacy Policy
            </Link>
            <span aria-hidden className="text-border">
              ·
            </span>
            <Link href="/terms-of-service" className="transition-colors hover:text-primary">
              Terms of Service
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
