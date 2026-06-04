export function WorkspaceHubSectionHeader({
  headingId,
  title,
  description,
  count,
}: {
  headingId: string;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="border-b-2 border-border/80 bg-muted/70 px-4 py-3">
      <div className="flex items-center gap-2">
        <h2
          id={headingId}
          className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
        >
          {title}
        </h2>
        {typeof count === 'number' ? (
          <span className="ml-auto rounded-md bg-background px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border">
            {count}
          </span>
        ) : null}
      </div>
      <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
