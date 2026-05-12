'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import SearchSelect from '@/components/ui/SearchSelect';
import { cn } from '@/lib/utils';
import {
  useGetCompaniesQuery,
  useGetCrossCompanyMaterialsQuery,
  useGetMaterialsQuery,
  useGetWarehousesQuery,
  useTransferStockMutation,
  type MaterialUomDto,
} from '@/store/hooks';

interface TransferLine {
  id: string;
  materialId: string;
  quantity: string;
  quantityUomId: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
}

function createLine(): TransferLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    materialId: '',
    quantity: '',
    quantityUomId: '',
    sourceWarehouseId: '',
    destinationWarehouseId: '',
  };
}

function isLineEmpty(line: TransferLine) {
  return !line.materialId && !line.quantity && !line.quantityUomId && !line.sourceWarehouseId && !line.destinationWarehouseId;
}

function normalizeLines(lines: TransferLine[]) {
  const filled = lines.filter((line) => !isLineEmpty(line));
  const minVisible = 5;
  const minEmpty = 3;
  const requiredEmpty = Math.max(minEmpty, minVisible - filled.length);
  return [...filled, ...Array.from({ length: requiredEmpty }, () => createLine())];
}

function sameLineValues(a: TransferLine[], b: TransferLine[]) {
  if (a.length !== b.length) return false;
  return a.every((line, index) => {
    const other = b[index];
    return (
      line.id === other.id &&
      line.materialId === other.materialId &&
      line.quantity === other.quantity &&
      line.quantityUomId === other.quantityUomId &&
      line.sourceWarehouseId === other.sourceWarehouseId &&
      line.destinationWarehouseId === other.destinationWarehouseId
    );
  });
}

type SelectMaterial = {
  id: string;
  name: string;
  unit: string;
  warehouse?: string;
  warehouseId?: string | null;
  currentStock: number;
  materialUoms?: MaterialUomDto[];
  isActive: boolean;
};

const controlInputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const tableSelectClass =
  'w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60';

export default function MultiInterCompanyTransferPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canTransfer = isSA || perms.includes('transaction.transfer');
  const activeCompanyId = session?.user?.activeCompanyId ?? '';

  const { data: companies = [] } = useGetCompaniesQuery(undefined, { skip: !canTransfer });
  const { data: ownMaterials = [] } = useGetMaterialsQuery(undefined, { skip: !canTransfer || !activeCompanyId });
  const [transferStock] = useTransferStockMutation();

  const [sourceCompanyId, setSourceCompanyId] = useState('');
  const [destinationCompanyId, setDestinationCompanyId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<TransferLine[]>(() => normalizeLines([createLine()]));
  const [submitting, setSubmitting] = useState(false);

  const usingOwnMaterials = sourceCompanyId === activeCompanyId;
  const sourceIsReady = Boolean(sourceCompanyId);
  const { data: externalSourceMaterials = [] } = useGetCrossCompanyMaterialsQuery(sourceCompanyId, {
    skip: !canTransfer || !sourceCompanyId || usingOwnMaterials,
  });
  const { data: destinationWarehouses = [] } = useGetWarehousesQuery(destinationCompanyId || undefined, {
    skip: !canTransfer || !destinationCompanyId,
  });
  const { data: sourceWarehouses = [] } = useGetWarehousesQuery(sourceCompanyId || undefined, {
    skip: !canTransfer || !sourceCompanyId,
  });

  const selectableCompanies = useMemo(
    () => companies.filter((company) => company.isActive),
    [companies]
  );
  const showSourceWarehouseColumn = true;
  const showDestinationWarehouseColumn = true;

  const sourceMaterials = useMemo<SelectMaterial[]>(() => {
    if (!sourceIsReady) return [];
    if (usingOwnMaterials) return ownMaterials.filter((material) => material.isActive);
    return externalSourceMaterials.filter((material) => material.isActive);
  }, [externalSourceMaterials, ownMaterials, sourceIsReady, usingOwnMaterials]);

  const sourceCompanyName = selectableCompanies.find((company) => company.id === sourceCompanyId)?.name || '';
  const destinationCompanyName = selectableCompanies.find((company) => company.id === destinationCompanyId)?.name || '';

  const updateLine = (id: string, field: keyof TransferLine, value: string) => {
    setLines((prev) =>
      normalizeLines(
        prev.map((line) => {
          if (line.id !== id) return line;
          if (field === 'materialId' && !value) return createLine();
          if (field === 'materialId') {
            const nextMaterial = sourceMaterials.find((material) => material.id === value);
            return {
              ...line,
              materialId: value,
              quantityUomId: '',
              sourceWarehouseId: nextMaterial?.warehouseId ?? '',
              destinationWarehouseId: '',
            };
          }
          return {
            ...line,
            [field]: value,
          };
        })
      )
    );
  };

  const removeLine = (id: string) => {
    setLines((prev) => normalizeLines(prev.filter((line) => line.id !== id)));
  };

  const getMaterial = (materialId: string) => sourceMaterials.find((material) => material.id === materialId);

  useEffect(() => {
    setLines((prev) => {
      const next = prev.map((line) => {
        if (!line.materialId) {
          return line.sourceWarehouseId || line.destinationWarehouseId
            ? { ...line, sourceWarehouseId: '', destinationWarehouseId: '' }
            : line;
        }
        const material = sourceMaterials.find((item) => item.id === line.materialId);
        const nextSourceWarehouseId =
          material?.warehouseId && sourceWarehouses.some((warehouse) => warehouse.id === material.warehouseId)
            ? material.warehouseId
            : '';

        const sourceWarehouseValid =
          !line.sourceWarehouseId || sourceWarehouses.some((warehouse) => warehouse.id === line.sourceWarehouseId);
        const destinationWarehouseValid =
          !line.destinationWarehouseId ||
          destinationWarehouses.some((warehouse) => warehouse.id === line.destinationWarehouseId);

        if (
          line.sourceWarehouseId === nextSourceWarehouseId &&
          sourceWarehouseValid &&
          destinationWarehouseValid
        ) {
          return line;
        }

        return {
          ...line,
          sourceWarehouseId: sourceWarehouseValid ? line.sourceWarehouseId || nextSourceWarehouseId : nextSourceWarehouseId,
          destinationWarehouseId: destinationWarehouseValid ? line.destinationWarehouseId : '',
        };
      });
      return sameLineValues(prev, next) ? prev : next;
    });
  }, [destinationWarehouses, sourceMaterials, sourceWarehouses]);

  const validLines = useMemo(
    () => lines.filter((line) => line.materialId && Number.parseFloat(line.quantity) > 0),
    [lines]
  );

  const totalQty = useMemo(
    () => validLines.reduce((sum, line) => sum + (Number.parseFloat(line.quantity) || 0), 0),
    [validLines]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceCompanyId || !destinationCompanyId) {
      toast.error('Select both source and destination companies');
      return;
    }
    if (sourceCompanyId === destinationCompanyId) {
      toast.error('Source and destination must be different');
      return;
    }
    if (validLines.length === 0) {
      toast.error('Add at least one material line');
      return;
    }
    if (validLines.some((line) => !line.destinationWarehouseId)) {
      toast.error('Select a destination warehouse for each material');
      return;
    }
    if (validLines.some((line) => !line.sourceWarehouseId)) {
      toast.error('Select a source warehouse for each material');
      return;
    }

    setSubmitting(true);
    try {
      for (const line of validLines) {
        await transferStock({
          sourceCompanyId,
          sourceWarehouseId: line.sourceWarehouseId || undefined,
          destinationCompanyId,
          destinationWarehouseId: line.destinationWarehouseId || undefined,
          destinationWarehouse:
            destinationWarehouses.find((warehouse) => warehouse.id === line.destinationWarehouseId)?.name || undefined,
          materialId: line.materialId,
          quantity: Number.parseFloat(line.quantity),
          quantityUomId: line.quantityUomId.trim() || undefined,
          notes: notes.trim() || undefined,
          date,
        }).unwrap();
      }

      toast.success(`Transferred ${validLines.length} item(s) successfully`);
      setLines(normalizeLines([createLine()]));
      setNotes('');
    } catch (error: unknown) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Transfer failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canTransfer) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <header className="border-b border-border pb-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Multi transfer</h1>
        </header>
        <Alert>
          <AlertDescription>You do not have permission to create inter-company transfers.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Multi transfer</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Move multiple items between companies</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Choose the source company and destination company, then route stock through required source and destination
            warehouses.
          </p>
        </div>
        <Link href="/stock/inter-company-transfers" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}>
          Back to ledger
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Source', value: sourceCompanyName || 'Choose', note: 'Company stock will be reduced' },
          {
            label: 'Destination',
            value: destinationCompanyName || 'Choose',
            note: `${validLines.filter((line) => line.destinationWarehouseId).length} destination warehouse selections ready`,
          },
          { label: 'Prepared lines', value: String(validLines.length), note: 'Rows with material and quantity' },
          { label: 'Entered qty', value: totalQty.toFixed(3), note: 'Raw entered transfer quantity' },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      >
        <div className="border-b border-border p-4 sm:p-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_minmax(220px,0.9fr)]">
            <SearchSelect
              label="Source company"
              value={sourceCompanyId}
              onChange={setSourceCompanyId}
              placeholder="Select source company..."
              dropdownInPortal
              items={selectableCompanies.map((company) => ({
                id: company.id,
                label: company.name,
                searchText: company.slug,
              }))}
            />
            <SearchSelect
              label="Destination company"
              value={destinationCompanyId}
              onChange={setDestinationCompanyId}
              placeholder="Select destination company..."
              dropdownInPortal
              items={selectableCompanies
                .filter((company) => company.id !== sourceCompanyId)
                .map((company) => ({
                  id: company.id,
                  label: company.name,
                  searchText: company.slug,
                }))}
            />
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Transfer date
              </label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={controlInputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional transfer note"
                className={controlInputClass}
              />
            </div>
          </div>
        </div>

        <div className="overflow-hidden border-b border-border">
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="min-w-[900px] w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="w-10 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    #
                  </th>
                  <th className="min-w-[320px] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Material
                  </th>
                  <th className="w-[170px] px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    UOM
                  </th>
                  {showSourceWarehouseColumn ? (
                    <th className="w-[190px] px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Source Warehouse
                    </th>
                  ) : null}
                  {showDestinationWarehouseColumn ? (
                    <th className="w-[190px] px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Dest Warehouse
                    </th>
                  ) : null}
                  <th className="w-[120px] px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Available
                  </th>
                  <th className="w-[150px] px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Transfer Qty
                  </th>
                  <th className="w-[56px] px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Clr
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const material = getMaterial(line.materialId);
                  return (
                    <tr key={line.id} className="border-b border-border">
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <SearchSelect
                          value={line.materialId}
                          onChange={(id) => updateLine(line.id, 'materialId', id)}
                          onBlurInputValue={(inputValue) => {
                            if (!inputValue.trim() && line.materialId) {
                              updateLine(line.id, 'materialId', '');
                            }
                          }}
                          placeholder={sourceCompanyId ? 'Search source materials...' : 'Select source company first...'}
                          disabled={!sourceCompanyId}
                          dropdownInPortal
                          items={sourceMaterials.map((material) => ({
                            id: material.id,
                            label: material.name,
                            searchText: `${material.currentStock} ${material.unit}`,
                          }))}
                          renderItem={(item) => (
                            <div className="flex w-full min-w-0 items-center justify-between gap-3">
                              <div className="truncate font-medium text-foreground">{item.label}</div>
                              <span className="text-xs text-muted-foreground">{item.searchText}</span>
                            </div>
                          )}
                        />
                      </td>
                      <td className="px-2 py-2">
                        {material?.materialUoms && material.materialUoms.length > 0 ? (
                          <select
                            value={line.quantityUomId}
                            onChange={(e) => updateLine(line.id, 'quantityUomId', e.target.value)}
                            className={tableSelectClass}
                          >
                            {material.materialUoms.map((uom) => (
                              <option key={uom.id} value={uom.isBase ? '' : uom.id}>
                                {uom.unitName}
                                {uom.isBase ? ' (base)' : ` (=${uom.factorToBase} ${material.unit})`}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-muted-foreground">{material?.unit ?? '-'}</span>
                        )}
                      </td>
                      {showSourceWarehouseColumn ? (
                        <td className="px-2 py-2">
                          <select
                            value={line.sourceWarehouseId}
                            onChange={(e) => updateLine(line.id, 'sourceWarehouseId', e.target.value)}
                            disabled={!sourceCompanyId || sourceWarehouses.length === 0}
                            className={tableSelectClass}
                          >
                            <option value="">Select warehouse...</option>
                            {sourceWarehouses.map((warehouse) => (
                              <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                      {showDestinationWarehouseColumn ? (
                        <td className="px-2 py-2">
                          <select
                            value={line.destinationWarehouseId}
                            onChange={(e) => updateLine(line.id, 'destinationWarehouseId', e.target.value)}
                            disabled={!destinationCompanyId || destinationWarehouses.length === 0}
                            className={tableSelectClass}
                          >
                            <option value="">
                              {!destinationCompanyId ? 'Select destination company' : 'Select warehouse...'}
                            </option>
                            {destinationWarehouses.map((warehouse) => (
                              <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                              </option>
                            ))}
                          </select>
                          {material?.warehouse && (
                            <p className="mt-1 text-[11px] text-muted-foreground">Material default: {material.warehouse}</p>
                          )}
                        </td>
                      ) : null}
                      <td className="px-2 py-2 text-right font-mono text-sm text-slate-900 dark:text-white">
                        {material ? material.currentStock.toFixed(3) : '-'}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={line.quantity}
                          onChange={(e) => updateLine(line.id, 'quantity', e.target.value)}
                          disabled={!material}
                          placeholder="0.00"
                          className={cn(controlInputClass, 'px-2.5 py-1.5 text-right')}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-sm text-muted-foreground">
            Source stock is reduced first, then the destination company is credited automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/stock/inter-company-transfers"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              Cancel
            </Link>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? 'Posting…' : 'Post transfer'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
