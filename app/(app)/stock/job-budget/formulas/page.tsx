'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import Spinner from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useDeleteFormulaLibraryMutation, useGetFormulaLibrariesQuery } from '@/store/hooks';

type FormulaRuleCounts = {
  areas: number;
  materials: number;
  labor: number;
};

function countRules(formulaConfig: unknown): FormulaRuleCounts {
  if (typeof formulaConfig !== 'object' || formulaConfig === null || !('areas' in formulaConfig)) {
    return { areas: 0, materials: 0, labor: 0 };
  }
  const areas = Array.isArray((formulaConfig as { areas?: unknown }).areas)
    ? (formulaConfig as { areas: unknown[] }).areas
    : [];
  return areas.reduce<FormulaRuleCounts>(
    (total, area) => {
      const areaRecord = typeof area === 'object' && area !== null ? (area as { materials?: unknown; labor?: unknown }) : {};
      const hasValidStructure = Array.isArray(areaRecord.materials) || Array.isArray(areaRecord.labor);
      return {
        areas: total.areas + (hasValidStructure ? 1 : 0),
        materials: total.materials + (Array.isArray(areaRecord.materials) ? areaRecord.materials.length : 0),
        labor: total.labor + (Array.isArray(areaRecord.labor) ? areaRecord.labor.length : 0),
      };
    },
    { areas: 0, materials: 0, labor: 0 } satisfies FormulaRuleCounts
  );
}

export default function StockFormulaLibraryPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || (perms.includes('job.view') && perms.includes('material.view'));
  const canManage = isSA || perms.includes('settings.manage');

  const { data: formulas = [], isLoading } = useGetFormulaLibrariesQuery(undefined, { skip: !canView });
  const [deleteFormula, { isLoading: deleting }] = useDeleteFormulaLibraryMutation();

  const grouped = useMemo(() => {
    const map = new Map<string, typeof formulas>();
    for (const formula of formulas) {
      const current = map.get(formula.fabricationType) ?? [];
      map.set(formula.fabricationType, [...current, formula]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [formulas]);

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete formula "${name}"? Existing job items using this formula may stop calculating.`)) return;
    try {
      await deleteFormula(id).unwrap();
      toast.success('Formula deleted');
    } catch (error) {
      const details =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { details?: unknown } }).data?.details === 'object' &&
        (error as { data: { details: unknown } }).data.details !== null
          ? (error as {
              data: {
                details: {
                  linkedJobItemCount?: number;
                  linkedJobItems?: Array<{
                    jobNumber?: string;
                    itemName?: string;
                  }>;
                };
              };
            }).data.details
          : null;
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to delete formula';
      if (details && Array.isArray(details.linkedJobItems) && details.linkedJobItems.length > 0) {
        const preview = details.linkedJobItems
          .slice(0, 5)
          .map((item) => `${item.jobNumber || 'Job'} - ${item.itemName || 'Item'}`)
          .join('\n');
        toast.error(`${message}\n${preview}${details.linkedJobItemCount && details.linkedJobItemCount > 5 ? '\n...' : ''}`, {
          duration: 7000,
        });
        return;
      }
      toast.error(message);
    }
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You need job.view and material.view permission to view formulas.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href="/stock/job-budget"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            ← Job budget
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Formula library</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Manage formula templates used by variation job budgets. Create and edit formulas on dedicated pages.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Link href="/stock/job-budget" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
            Back
          </Link>
          {canManage ? (
            <Link href="/stock/job-budget/formulas/new" className={cn(buttonVariants({ size: 'sm' }))}>
              New formula
            </Link>
          ) : null}
        </div>
      </header>

      {!isLoading && grouped.length > 0 ? (
        <section className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Templates</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{formulas.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Saved formula libraries</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Fabrication scopes</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{grouped.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Distinct fabrication groupings</p>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card">
          <Spinner size="lg" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No formulas yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([fabricationType, items]) => (
            <section key={fabricationType} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{fabricationType}</h2>
                  <p className="text-sm text-muted-foreground">
                    {items.length} formula{items.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {items.map((formula) => {
                  const counts = countRules(formula.formulaConfig);
                  return (
                    <div
                      key={formula.id}
                      className="rounded-lg border border-border bg-muted/30 p-4 dark:bg-muted/15"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-foreground">{formula.name}</h3>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">{formula.slug}</p>
                        </div>
                        {canManage ? (
                          <div className="flex shrink-0 flex-wrap justify-end gap-2">
                            <Link
                              href={`/stock/job-budget/formulas/${formula.id}/edit`}
                              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                            >
                              Edit
                            </Link>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={deleting}
                              onClick={() => remove(formula.id, formula.name)}
                            >
                              Delete
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        {formula.description || 'No description yet.'}
                      </p>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-md border border-border bg-background px-3 py-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Areas</p>
                          <p className="mt-1 font-semibold tabular-nums text-foreground">{counts.areas}</p>
                        </div>
                        <div className="rounded-md border border-border bg-background px-3 py-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Materials
                          </p>
                          <p className="mt-1 font-semibold tabular-nums text-foreground">{counts.materials}</p>
                        </div>
                        <div className="rounded-md border border-border bg-background px-3 py-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Labor</p>
                          <p className="mt-1 font-semibold tabular-nums text-foreground">{counts.labor}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
