'use client';

import { ChevronDown, ChevronUp, Copy, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MaterialCostingRuleRow = {
  id: string;
  materialName: string;
  sourceLabel: 'fixed' | 'job material';
  quantityExpression: string;
  wastePercent: string;
  preview: string;
};

type BuilderActions = {
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRemove: (id: string) => void;
  canMoveUp: (id: string) => boolean;
  canMoveDown: (id: string) => boolean;
};

function toneClasses() {
  return {
    shell: 'w-full overflow-x-auto rounded-xl border border-teal-100 bg-white dark:border-teal-500/20 dark:bg-slate-950/70',
    head: 'bg-teal-50 text-[11px] uppercase tracking-[0.16em] text-teal-800 dark:bg-teal-500/10 dark:text-teal-200',
    quantityMono: 'font-mono text-teal-700 dark:text-teal-300',
    wasteMono: 'font-mono text-slate-600 dark:text-slate-400',
    badgeFixed:
      'inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    badgeJob:
      'inline-flex rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300',
  };
}

export function MaterialCostingRulesTable({
  rows,
  builderActions,
}: {
  rows: MaterialCostingRuleRow[];
  builderActions: BuilderActions;
}) {
  const classes = toneClasses();

  if (rows.length === 0) return null;

  return (
    <div className={classes.shell}>
      <table className="w-full min-w-208 text-left text-sm">
        <thead className={classes.head}>
          <tr>
            <th className="w-10 px-3 py-2.5 font-semibold">#</th>
            <th className="min-w-40 px-3 py-2.5 font-semibold">Material</th>
            <th className="w-28 px-3 py-2.5 font-semibold">Source</th>
            <th className="min-w-56 px-3 py-2.5 font-semibold">Quantity formula</th>
            <th className="min-w-36 px-3 py-2.5 font-semibold">Waste %</th>
            <th className="min-w-40 px-3 py-2.5 font-semibold">Preview</th>
            <th className="w-36 px-3 py-2.5 text-right font-semibold" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className="border-t border-teal-100 dark:border-teal-500/15">
              <td className="px-3 py-2.5 text-muted-foreground">{index + 1}</td>
              <td className="px-3 py-2.5 font-medium text-foreground">{row.materialName}</td>
              <td className="px-3 py-2.5">
                <span className={row.sourceLabel === 'job material' ? classes.badgeJob : classes.badgeFixed}>
                  {row.sourceLabel}
                </span>
              </td>
              <td className={cn('px-3 py-2.5 text-xs', classes.quantityMono)}>
                <span className="line-clamp-2 break-all">{row.quantityExpression || '—'}</span>
              </td>
              <td className={cn('px-3 py-2.5 text-xs', classes.wasteMono)}>
                <span className="line-clamp-2 break-all">{row.wastePercent || '0'}</span>
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                <span className="line-clamp-2">{row.preview || '—'}</span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-0.5">
                  <button
                    type="button"
                    onClick={() => builderActions.onEdit(row.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => builderActions.onDuplicate(row.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                    title="Duplicate"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={!builderActions.canMoveUp(row.id)}
                    onClick={() => builderActions.onMoveUp(row.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    title="Move up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={!builderActions.canMoveDown(row.id)}
                    onClick={() => builderActions.onMoveDown(row.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    title="Move down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => builderActions.onRemove(row.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
