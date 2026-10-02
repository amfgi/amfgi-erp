'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import GoodsReceiptLineGrid, { type GoodsReceiptLineGridRow } from '@/components/stock/GoodsReceiptLineGrid';
import QuickCreateMaterialModal from '@/components/stock/QuickCreateMaterialModal';
import SearchSelect from '@/components/ui/SearchSelect';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { usePagedMaterialSearch } from '@/lib/stock/pagedSelectSearch';
import { convertLineQuantity, convertLineUnitCost, defaultDisplayUnitCost, getMaterialUomFactor } from '@/lib/stock/uomLineDisplay';
import { cn } from '@/lib/utils';
import { useGetWarehousesQuery, usePostFactoryProductionMutation, type Material } from '@/store/hooks';

const MIN_VISIBLE_ROWS = 8;
const MIN_EMPTY_ROWS = 3;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function todayYmd() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyLine(warehouseId = ''): GoodsReceiptLineGridRow {
  return {
    id: uid(),
    materialId: '',
    quantity: '',
    quantityUomId: '',
    unitCost: '',
    warehouseId,
  };
}

function isLineEmpty(line: GoodsReceiptLineGridRow) {
  return !line.materialId && !line.quantity && !line.quantityUomId && !line.unitCost;
}

function normalizeLines(lines: GoodsReceiptLineGridRow[], warehouseId: string) {
  const nonEmpty = lines.filter((line) => !isLineEmpty(line)).map((line) => ({ ...line, warehouseId }));
  const requiredEmpty = Math.max(MIN_EMPTY_ROWS, MIN_VISIBLE_ROWS - nonEmpty.length);
  return [...nonEmpty, ...Array.from({ length: requiredEmpty }, () => emptyLine(warehouseId))];
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }
  return fallback;
}

export default function NewFactoryProductionPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const canPost = isSuperAdmin || perms.includes('transaction.stock_in');
  const canCreateMaterial = isSuperAdmin || perms.includes('material.create');

  const { search: searchMaterials, resolveById: resolveMaterialById } = usePagedMaterialSearch();
  const { data: warehouses = [] } = useGetWarehousesQuery(undefined, { skip: !canPost });
  const [postProduction, { isLoading: posting }] = usePostFactoryProductionMutation();

  const [productionDate, setProductionDate] = useState(todayYmd);
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<GoodsReceiptLineGridRow[]>(() => normalizeLines([emptyLine()], ''));
  const [materialsById, setMaterialsById] = useState<Record<string, Material>>({});
  const [createMaterialContext, setCreateMaterialContext] = useState<{ lineId: string; name: string } | null>(null);

  const activeWarehouses = useMemo(() => warehouses.filter((warehouse) => warehouse.isActive), [warehouses]);
  const warehouseOptions = useMemo(
    () =>
      activeWarehouses.map((warehouse) => ({
        id: warehouse.id,
        label: warehouse.name,
        searchText: warehouse.location ?? '',
      })),
    [activeWarehouses]
  );
  const gridWarehouses = useMemo(
    () => activeWarehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name })),
    [activeWarehouses]
  );

  const getMaterial = useCallback((id: string) => materialsById[id], [materialsById]);
  const rememberMaterial = useCallback((material: Material) => {
    setMaterialsById((prev) => (prev[material.id] === material ? prev : { ...prev, [material.id]: material }));
  }, []);

  const applyMaterialDefaults = (line: GoodsReceiptLineGridRow, material: Material): GoodsReceiptLineGridRow => ({
    ...line,
    materialId: material.id,
    warehouseId,
    unitCost: line.unitCost || defaultDisplayUnitCost(material, line.quantityUomId),
  });

  const handleMaterialResolved = useCallback(
    (lineId: string, material: Material) => {
      rememberMaterial(material);
      setLines((prev) =>
        normalizeLines(
          prev.map((line) => (line.id === lineId ? applyMaterialDefaults(line, material) : line)),
          warehouseId
        )
      );
    },
    [rememberMaterial, warehouseId]
  );

  const updateLine = (id: string, field: keyof GoodsReceiptLineGridRow, value: string) => {
    setLines((prev) =>
      normalizeLines(
        prev.map((line) => {
          if (line.id !== id) return line;
          const updated = { ...line, [field]: value, warehouseId };
          if (field === 'materialId' && !value) {
            updated.quantity = '';
            updated.quantityUomId = '';
            updated.unitCost = '';
          }
          if (field === 'materialId' && value) {
            const material = getMaterial(value);
            if (material) return applyMaterialDefaults(updated, material);
          }
          if (field === 'quantityUomId') {
            const material = getMaterial(line.materialId);
            if (material) {
              updated.unitCost = convertLineUnitCost(line.unitCost, material, line.quantityUomId, value);
              updated.quantity = convertLineQuantity(line.quantity, material, line.quantityUomId, value);
            }
          }
          return updated;
        }),
        warehouseId
      )
    );
  };

  const changeWarehouse = (nextWarehouseId: string) => {
    setWarehouseId(nextWarehouseId);
    setLines((prev) => normalizeLines(prev, nextWarehouseId));
  };

  const filledLines = lines.filter((line) => line.materialId && Number(line.quantity) > 0);
  const duplicateMaterials = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of filledLines) counts.set(line.materialId, (counts.get(line.materialId) ?? 0) + 1);
    return [...counts.entries()].filter(([, count]) => count > 1).map(([materialId]) => materialId);
  }, [filledLines]);

  const submit = async () => {
    if (!warehouseId) {
      toast.error('Select a warehouse');
      return;
    }
    if (filledLines.length === 0) {
      toast.error('Add at least one material and quantity');
      return;
    }
    if (duplicateMaterials.length > 0) {
      toast.error('Each material can appear only once');
      return;
    }

    const payloadLines = [];
    for (const line of filledLines) {
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        toast.error('Each line needs a quantity greater than zero');
        return;
      }
      const material = getMaterial(line.materialId);
      payloadLines.push({
        materialId: line.materialId,
        quantity: quantity * getMaterialUomFactor(material, line.quantityUomId),
      });
    }

    try {
      await postProduction({
        productionDate,
        warehouseId,
        notes: notes.trim() || null,
        lines: payloadLines,
      }).unwrap();
      toast.success('Production received into stock');
      router.push('/stock/factory-production');
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to post factory production'));
    }
  };

  if (!canPost) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <header className="border-b border-border pb-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">New factory production</h1>
        </header>
        <Alert variant="destructive">
          <AlertDescription>You need receive-stock permission to post factory production.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href="/stock/factory-production"
            className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'h-auto p-0 text-xs font-medium uppercase tracking-wide')}
          >
            Production ledger
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Receive factory production</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Post materials made for later jobs into one warehouse. Stock is valued at each material&apos;s current unit cost.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/stock/factory-production" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Back to history
          </Link>
          <Button type="button" size="sm" onClick={() => void submit()} disabled={posting}>
            {posting ? 'Receiving…' : 'Receive into stock'}
          </Button>
        </div>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.defaultPrevented) {
            const target = event.target as HTMLElement;
            if (target.tagName !== 'TEXTAREA') event.preventDefault();
          }
        }}
        className="flex flex-col gap-0 overflow-x-auto rounded-lg border border-border bg-card pb-8 shadow-sm"
      >
        <div className="border-b border-border p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Production date
              </span>
              <input
                type="date"
                required
                value={productionDate}
                onChange={(event) => setProductionDate(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <div>
              <SearchSelect
                items={warehouseOptions}
                value={warehouseId}
                onChange={changeWarehouse}
                label="Warehouse"
                placeholder="Search warehouse…"
                openOnFocus
                minCharactersToSearch={0}
                dropdownInPortal
              />
            </div>
            <label className="block sm:col-span-2 xl:col-span-1">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</span>
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional batch or mould reference"
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {filledLines.length} active line{filledLines.length === 1 ? '' : 's'}. The warehouse applies to every row.
          </p>
        </div>

        <GoodsReceiptLineGrid
          lines={lines}
          getMaterial={getMaterial}
          searchMaterials={searchMaterials}
          resolveMaterialById={resolveMaterialById}
          onMaterialResolved={handleMaterialResolved}
          warehouses={gridWarehouses}
          showWarehouseColumn={false}
          emptyMessage="Search for a material on the first row to start."
          duplicateMaterialIds={duplicateMaterials}
          onUpdateLine={updateLine}
          canCreateMaterial={canCreateMaterial}
          onRequestCreateMaterial={(lineId, name) => setCreateMaterialContext({ lineId, name })}
        />

        <QuickCreateMaterialModal
          isOpen={createMaterialContext !== null}
          defaultName={createMaterialContext?.name ?? ''}
          warehouses={gridWarehouses}
          onClose={() => setCreateMaterialContext(null)}
          onCreated={(material) => {
            if (!createMaterialContext) return;
            rememberMaterial(material);
            handleMaterialResolved(createMaterialContext.lineId, material);
            setCreateMaterialContext(null);
          }}
        />
      </form>
    </div>
  );
}
