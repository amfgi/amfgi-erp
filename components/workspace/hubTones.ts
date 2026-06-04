export type WorkspaceHubTone = 'emerald' | 'sky' | 'amber' | 'muted';

export const workspaceHubToneBadgeClass: Record<WorkspaceHubTone, string> = {
  emerald: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  sky: 'border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200',
  amber: 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  muted: 'border-border bg-muted/50 text-muted-foreground',
};
