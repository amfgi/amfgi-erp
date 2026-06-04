import Link from 'next/link';

import { buttonVariants } from '@/components/ui/shadcn/button';

export type WorkspaceHubQuickAction = {
  href: string;
  label: string;
};

export function WorkspaceHubQuickActions({
  actions,
  title = 'Quick actions',
  description,
  headingId = 'workspace-hub-quick-actions',
}: {
  actions: WorkspaceHubQuickAction[];
  title?: string;
  description?: string;
  headingId?: string;
}) {
  if (actions.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
      aria-labelledby={headingId}
    >
      <h2
        id={headingId}
        className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
      >
        {title}
      </h2>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={buttonVariants({ size: 'default', className: 'min-w-38' })}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
