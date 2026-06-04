import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { WorkspaceHubSectionsGrid } from '@/components/workspace/WorkspaceHubSectionsGrid';

export function WorkspaceHubLoadingSkeleton({
  sectionCount = 6,
  columns = 3,
}: {
  sectionCount?: number;
  columns?: 2 | 3;
}) {
  return (
    <WorkspaceHubSectionsGrid columns={columns}>
      {Array.from({ length: sectionCount }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b-2 border-border/80 bg-muted/70 px-4 py-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2 h-3 w-full" />
          </div>
          <div className="flex flex-col divide-y divide-border bg-background/40">
            {[0, 1].map((row) => (
              <div key={row} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-40 max-w-[85%]" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </WorkspaceHubSectionsGrid>
  );
}
