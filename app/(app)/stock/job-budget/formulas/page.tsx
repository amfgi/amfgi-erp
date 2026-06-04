'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
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
  const canView = isSA || perms.includes('stock.formula.view');
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

  const tableRows = useMemo(
    () =>
      [...formulas].sort((a, b) => {
        const groupCompare = a.fabricationType.localeCompare(b.fabricationType);
        if (groupCompare !== 0) return groupCompare;
        return a.name.localeCompare(b.name);
      }),
    [formulas]
  );

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
          <AlertDescription>You need the Stock — Formula → View permission to view formulas.</AlertDescription>
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
            className={cn(
              buttonVariants({ variant: 'link', size: 'sm' }),
              'h-auto p-0 text-xs font-medium uppercase tracking-wide text-muted-foreground',
            )}
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

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card">
          <Spinner size="lg" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No formulas yet.
        </div>
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-1 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Saved formulas</h2>
              <p className="text-xs text-muted-foreground">
                {formulas.length} template{formulas.length === 1 ? '' : 's'} across {grouped.length} fabrication scope
                {grouped.length === 1 ? '' : 's'}.
              </p>
            </div>
          </div>
          <Table>
            <TableCaption>Formula templates sorted by fabrication scope and name.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Formula</TableHead>
                <TableHead>Fabrication scope</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Areas</TableHead>
                <TableHead className="text-right">Materials</TableHead>
                <TableHead className="text-right">Labor</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.map((formula) => {
                const counts = countRules(formula.formulaConfig);
                return (
                  <TableRow key={formula.id}>
                    <TableCell className="min-w-56">
                      <div className="font-medium text-foreground">{formula.name}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">{formula.slug}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{formula.fabricationType || 'Unassigned'}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md text-muted-foreground">
                      <span className="line-clamp-2">{formula.description || 'No description yet.'}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{counts.areas}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{counts.materials}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{counts.labor}</TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
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
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
