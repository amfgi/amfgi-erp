import type { ReactNode } from 'react';

export function WorkspaceHubHeader({
  eyebrow,
  title,
  description,
  trailing,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {trailing ? (
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground sm:pb-0.5">{trailing}</p>
      ) : null}
    </header>
  );
}
