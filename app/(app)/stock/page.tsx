'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSession } from 'next-auth/react';

import { Badge } from '@/components/ui/shadcn/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import {
  useGetMaterialsQuery,
  useGetStockBatchesQuery,
  useGetStockIntegrityQuery,
  useGetStockValuationQuery,
} from '@/store/hooks';
import { cn } from '@/lib/utils';

type Tone = 'emerald' | 'sky' | 'amber' | 'muted';

function splitMoney(value: number, currencyCode: string) {
  const formatted = value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return { currency: currencyCode, amount: formatted };
}

function formatMoney(value: number, currencyCode: string) {
  return `${currencyCode} ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

const toneBadgeClass: Record<Tone, string> = {
  emerald: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  sky: 'border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200',
  amber: 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  muted: 'border-border bg-muted/50 text-muted-foreground',
};

type StockLinkRow = {
  href: string;
  title: string;
  description: string;
  tag: string;
  tone: Tone;
};

type StockSection = {
  id: string;
  title: string;
  description: string;
  rows: StockLinkRow[];
};

function StockListRow({ row }: { row: StockLinkRow }) {
  return (
    <Link
      href={row.href}
      className={cn(
        'flex min-h-13 items-start gap-3 px-4 py-3 transition-colors',
        'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">{row.title}</span>
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap',
              toneBadgeClass[row.tone],
            )}
          >
            {row.tag}
          </Badge>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{row.description}</p>
      </div>
      <span className="shrink-0 pt-1 text-xs font-medium text-muted-foreground" aria-hidden>
        →
      </span>
    </Link>
  );
}

function SectionPanel({ section }: { section: StockSection }) {
  const headingId = `stock-section-${section.id}`;
  const { rows: visibleRows } = section;

  if (visibleRows.length === 0) return null;

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      aria-labelledby={headingId}
    >
      <div className="flex flex-col gap-0.5 bg-muted/30 px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 id={headingId} className="text-sm font-semibold text-foreground">
            {section.title}
          </h2>
          <span className="text-xs tabular-nums text-muted-foreground">{visibleRows.length}</span>
        </div>
        <p className="text-xs leading-snug text-muted-foreground">{section.description}</p>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col divide-y divide-border" role="list">
        {visibleRows.map((row) => (
          <li key={row.href} role="listitem">
            <StockListRow row={row} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ValuationPanel({
  valuationLoading,
  preferredMoney,
  preferredMethod,
  currentMoney,
  warehouseBreakdown,
  fallbackWarehouseName,
  currencyCode,
}: {
  valuationLoading: boolean;
  preferredMoney: { currency: string; amount: string };
  preferredMethod: string;
  currentMoney: { currency: string; amount: string };
  warehouseBreakdown: { warehouseId: string | number; warehouseName: string; stockValue: number }[];
  fallbackWarehouseName: string | null;
  currencyCode: string;
}) {
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      aria-labelledby="stock-valuation-heading"
    >
      <div className="border-b border-border bg-muted/30 px-3 py-2.5 sm:px-4">
        <h2 id="stock-valuation-heading" className="text-sm font-semibold text-foreground">
          Valuation
        </h2>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          Company preferred method versus current material cost, then warehouse value coverage.
        </p>
      </div>

      <div className="space-y-4 p-3 sm:p-4">
        <div className="grid max-w-2xl grid-cols-2 gap-2 sm:gap-3">
          <Card className="border-border bg-muted/20 shadow-none">
            <CardHeader className="gap-1 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-primary">Preferred</p>
                <span className="text-[10px] font-medium text-muted-foreground">{preferredMoney.currency}</span>
              </div>
              <CardTitle className="text-base font-semibold tabular-nums leading-tight tracking-tight sm:text-lg">
                {valuationLoading ? '…' : preferredMoney.amount}
              </CardTitle>
              <CardDescription className="text-[10px] leading-snug">{preferredMethod} stock value</CardDescription>
              <Badge variant="secondary" className="mt-0.5 h-5 w-fit px-1.5 text-[9px] uppercase tracking-wide">
                Company preferred
              </Badge>
            </CardHeader>
          </Card>
          <Card className="border-border bg-muted/20 shadow-none">
            <CardHeader className="gap-1 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Comparison</p>
                <span className="text-[10px] font-medium text-muted-foreground">{currentMoney.currency}</span>
              </div>
              <CardTitle className="text-base font-semibold tabular-nums leading-tight tracking-tight sm:text-lg">
                {valuationLoading ? '…' : currentMoney.amount}
              </CardTitle>
              <CardDescription className="text-[10px] leading-snug">Current material cost value</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Warehouse coverage</p>
          {warehouseBreakdown.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {fallbackWarehouseName
                ? `No warehouse balances yet. System reference: ${fallbackWarehouseName}.`
                : 'No warehouse balances yet.'}
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {warehouseBreakdown.slice(0, 6).map((warehouse) => (
                <div
                  key={String(warehouse.warehouseId)}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-foreground">{warehouse.warehouseName}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatMoney(warehouse.stockValue, currencyCode)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function StockPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;

  const canSeeMaterials = isSA || perms.includes('material.view');
  const canSeeReceipts = isSA || perms.includes('transaction.stock_in');
  const canSeeDispatch = isSA || perms.includes('transaction.stock_out');
  const canSeeBatches = isSA || perms.includes('material.view') || perms.includes('transaction.stock_in');
  const canSeeTransfers = isSA || perms.includes('transaction.transfer');
  const canSeeReconcile = isSA || perms.includes('transaction.reconcile');
  const canSeeAdjustments = isSA || perms.includes('transaction.adjust');
  const canSeeJobBudget = isSA || (perms.includes('job.view') && perms.includes('material.view'));
  const canViewStock =
    canSeeMaterials ||
    canSeeReceipts ||
    canSeeDispatch ||
    canSeeBatches ||
    canSeeTransfers ||
    canSeeReconcile ||
    canSeeAdjustments ||
    canSeeJobBudget;
  const canSeeMasterData = isSA || perms.includes('settings.manage') || perms.includes('material.view');

  const { data: valuation, isFetching: valuationLoading } = useGetStockValuationQuery(undefined, {
    skip: !canViewStock,
  });
  const { data: materials = [], isFetching: materialsLoading } = useGetMaterialsQuery(undefined, {
    skip: !canSeeMaterials,
  });
  const { data: batches = [], isFetching: batchesLoading } = useGetStockBatchesQuery(undefined, {
    skip: !canSeeBatches,
  });
  const { data: stockIntegrity, isFetching: integrityLoading } = useGetStockIntegrityQuery(undefined, {
    skip: !canViewStock,
  });

  const activeMaterials = useMemo(
    () => materials.filter((material) => material.isActive),
    [materials],
  );
  const openBatches = useMemo(() => batches.filter((batch) => batch.quantityAvailable > 0), [batches]);
  const lowStockCount = useMemo(
    () =>
      activeMaterials.filter(
        (material) =>
          typeof material.reorderLevel === 'number' && material.currentStock <= material.reorderLevel,
      ).length,
    [activeMaterials],
  );
  const integrityExceptionCount = stockIntegrity?.summary.materialsWithExceptions ?? 0;

  const preferredValue = valuation?.summary.totalStockValue ?? 0;
  const currencyCode = valuation?.summary.currencyCode ?? 'AED';
  const preferredMethod = valuation?.summary.preferredMethod ?? 'FIFO';
  const currentValue = valuation?.summary.currentStockValue ?? 0;
  const fallbackWarehouseName = valuation?.summary.fallbackWarehouseName ?? null;
  const warehouseBreakdown = valuation?.warehouseBreakdown ?? [];
  const preferredMoney = splitMoney(preferredValue, currencyCode);
  const currentMoney = splitMoney(currentValue, currencyCode);

  const sections: StockSection[] = [
    {
      id: 'receive',
      title: 'Receive',
      description: 'Goods receipt creates stock batches and normalizes cost to the base unit.',
      rows: [
        ...(canSeeReceipts
          ? ([
              {
                href: '/stock/goods-receipt/receive',
                title: 'New receipt',
                description: 'Start a receive entry and post incoming stock against suppliers.',
                tag: 'Action',
                tone: 'emerald',
              },
              {
                href: '/stock/goods-receipt',
                title: 'Goods receipt',
                description: 'Create receipts, reopen bills, and trace incoming stock.',
                tag: `${formatCount(openBatches.length)} open`,
                tone: 'sky',
              },
            ])
          : []),
      ],
    },
    {
      id: 'store',
      title: 'Store',
      description: 'Materials hold live balances; batches hold FIFO layers by warehouse.',
      rows: [
        ...(canSeeMaterials
          ? ([
              {
                href: '/stock/materials',
                title: 'Materials',
                description: 'Maintain items, UOM, stock definitions, and current balance.',
                tag: `${formatCount(activeMaterials.length)} active`,
                tone: 'emerald',
              },
            ])
          : []),
        ...(canSeeMasterData
          ? ([
              {
                href: '/stock/master-data',
                title: 'Master data',
                description: 'Units, material categories, and warehouses used across receipts and materials.',
                tag: 'Setup',
                tone: 'muted',
              },
            ])
          : []),
        ...(canSeeBatches
          ? ([
              {
                href: '/stock/stock-batches',
                title: 'Stock batches',
                description: 'Inspect FIFO layers, remaining balance, and receipt-by-receipt cost.',
                tag: `${formatCount(batches.length)} batches`,
                tone: 'sky',
              },
              {
                href: '/stock/inventory-by-warehouse',
                title: 'Inventory by warehouse',
                description: 'See each material’s quantity split across warehouses from live balances.',
                tag: 'Warehouses',
                tone: 'amber',
              },
            ])
          : []),
      ],
    },
    {
      id: 'issue',
      title: 'Issue',
      description: 'Dispatch consumes the oldest open batch first, then rolls to the next layer when needed.',
      rows: [
        ...(canSeeDispatch
          ? ([
              {
                href: '/stock/dispatch/entry',
                title: 'New dispatch',
                description: 'Issue material from open FIFO layers to jobs or internal use.',
                tag: 'Action',
                tone: 'emerald',
              },
              {
                href: '/stock/dispatch/delivery-note',
                title: 'Delivery note',
                description: 'Create delivery paperwork linked to stock-out lines.',
                tag: 'Action',
                tone: 'sky',
              },
              {
                href: '/stock/dispatch',
                title: 'Dispatch',
                description: 'Issue material, create delivery notes, and follow stock-out flow.',
                tag: `${formatCount(lowStockCount)} low`,
                tone: 'amber',
              },
            ])
          : []),
        ...(canSeeTransfers
          ? ([
              {
                href: '/stock/inter-company-transfers',
                title: 'Inter-company transfers',
                description: 'Review transfer history and move stock between companies.',
                tag: 'Transfer',
                tone: 'muted',
              },
            ])
          : []),
      ],
    },
    {
      id: 'review',
      title: 'Review & control',
      description: 'Reconcile drift, approve adjustments, and tie stock back to jobs and counts.',
      rows: [
        ...(canViewStock
          ? ([
              {
                href: '/stock/integrity',
                title: 'Stock integrity',
                description: 'Compare company stock, warehouse balances, and open FIFO batches.',
                tag: integrityLoading ? '…' : `${formatCount(integrityExceptionCount)} issues`,
                tone: integrityExceptionCount > 0 ? 'amber' : 'muted',
              },
            ])
          : []),
        ...(canSeeReconcile
          ? ([
              {
                href: '/stock/issue-reconcile',
                title: 'Issue reconcile',
                description: 'Distribute non-stock quantities into variation jobs from reconcile history.',
                tag: 'Reconcile',
                tone: 'sky',
              },
            ])
          : []),
        ...(canSeeAdjustments
          ? ([
              {
                href: '/stock/manual-adjustments',
                title: 'Manual adjustments',
                description: 'Controlled corrections with approval before balances change.',
                tag: 'Adjust',
                tone: 'emerald',
              },
              {
                href: '/stock/count-session',
                title: 'Stock count session',
                description: 'Warehouse count sheet, variances, and adjustment requests.',
                tag: 'Count',
                tone: 'amber',
              },
            ])
          : []),
        ...(canSeeJobBudget
          ? ([
              {
                href: '/stock/job-budget',
                title: 'Job budget & formulas',
                description: 'Formula templates and variation job material budgets.',
                tag: 'Jobs',
                tone: 'muted',
              },
            ])
          : []),
        ...(isSA || perms.includes('job.view')
          ? ([
              {
                href: '/stock/daily-quantity-log',
                title: 'Daily quantity log',
                description: 'Log daily progress quantities from the work schedule for tracked jobs.',
                tag: 'Schedule',
                tone: 'sky',
              },
            ])
          : []),
      ],
    },
  ] as StockSection[];

  const linkModuleCount = sections.reduce((n, s) => n + s.rows.length, 0);

  if (!canViewStock) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stock</CardTitle>
          <CardDescription>You do not have permission to view the stock workspace.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stock workspace</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Stock</h1>
          <p className="text-sm text-muted-foreground">
            Workflows from receive through store, issue, and review. Valuation figures update from live materials and
            batches.
          </p>
        </div>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {materialsLoading || batchesLoading ? 'Refreshing…' : `${linkModuleCount} destinations`}
        </p>
      </header>

      <ValuationPanel
        valuationLoading={valuationLoading}
        preferredMoney={preferredMoney}
        preferredMethod={preferredMethod}
        currentMoney={currentMoney}
        warehouseBreakdown={warehouseBreakdown}
        fallbackWarehouseName={fallbackWarehouseName}
        currencyCode={currencyCode}
      />

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <SectionPanel key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}
