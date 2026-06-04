import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function WorkspaceHubSectionsGrid({
  children,
  columns = 3,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid w-full min-w-0 grid-cols-1 gap-4',
        columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
