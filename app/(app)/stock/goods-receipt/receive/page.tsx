'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/shadcn/alert';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import FlexibleTable, { type FlexibleTableColumn } from '@/components/ui/FlexibleTable';
import SearchSelect from '@/components/ui/SearchSelect';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import {
  useAddBatchTransactionMutation,
  useDeleteReceiptEntryMutation,
  useGetMaterialsQuery,
  useGetReceiptEntryQuery,
  useGetSuppliersQuery,
  useGetWarehousesQuery,
} from '@/store/hooks';
import { cn } from '@/lib/utils';

interface SupplierOption {
  id: string;
  label: string;
}

interface LineItem {
  id: string;
  materialId: string;
  quantity: string;
  quantityUomId: string;
  unitCost: string;
  warehouseId: string;
}

const TAX_RATE = 0.05;
const MIN_VISIBLE_ROWS = 5;
const MIN_EMPTY_ROWS = 3;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function buildDraftReceiptNumber() {
  // const now = new Date();
  // const yyyy = now.getFullYear();
  // const mm = String(now.getMonth() + 1).padStart(2, '0');
  // const dd = String(now.getDate()).padStart(2, '0');
  // const rand = Math.floor(Math.random() * 900 + 100);
  // return `GRN-${yyyy}${mm}${dd}-${rand}`;
  return ""
}

function emptyLine(): LineItem {
  return { id: uid(), materialId: '', quantity: '', quantityUomId: '', unitCost: '', warehouseId: '' };
}

function isLineEmpty(line: LineItem) {
  return !line.materialId && !line.quantity && !line.quantityUomId && !line.unitCost;
}

function normalizeLines(lines: LineItem[]) {
  const nonEmptyLines = lines.filter((line) => !isLineEmpty(line));
  const requiredEmptyRows = Math.max(MIN_EMPTY_ROWS, MIN_VISIBLE_ROWS - nonEmptyLines.length);
  return [...nonEmptyLines, ...Array.from({ length: requiredEmptyRows }, () => emptyLine())];
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data?: unknown }).data === 'object' &&
    (error as { data?: { error?: unknown } }).data?.error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }

  return fallback;
}

function inputClassName() {
  return 'w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';
}

function tableInputClassName() {
  return 'w-full border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';
}

function shellClassName() {
  return 'rounded-lg border border-border bg-card shadow-sm';
}

function sectionHeadingClassName() {
  return 'text-sm font-semibold uppercase tracking-wide text-muted-foreground';
}

function ReceiptEditor({
  initialReceiptNumber,
  initialSupplierId,
  initialDate,
  initialNotes,
  initialLines,
  isEditMode,
  editReceiptNumber,
}: {
  initialReceiptNumber: string;
  initialSupplierId: string;
  initialDate: string;
  initialNotes: string;
  initialLines: LineItem[];
  isEditMode: boolean;
  editReceiptNumber: string | null;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: materialsData = [] } = useGetMaterialsQuery();
  const { data: suppliersData = [] } = useGetSuppliersQuery();
  const { data: warehouses = [] } = useGetWarehousesQuery();
  const [addBatchTransaction] = useAddBatchTransactionMutation();
  const [deleteReceiptEntry] = useDeleteReceiptEntryMutation();

  const [lines, setLines] = useState<LineItem[]>(() =>
    normalizeLines(initialLines.length > 0 ? initialLines : [emptyLine()])
  );
  const [receiptNumber, setReceiptNumber] = useState(initialReceiptNumber);
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [date, setDate] = useState(initialDate);
  const [notes, setNotes] = useState(initialNotes);
  const [includeTax, setIncludeTax] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canPost = isSA || perms.includes('transaction.stock_in');
  const showWarehouseColumn = true;

  const suppliers = useMemo<SupplierOption[]>(
    () =>
      suppliersData.map((supplier) => ({
        id: supplier.id,
        label: supplier.name,
      })),
    [suppliersData]
  );

  const materialOptions = useMemo(
    () =>
      materialsData.map((entry) => ({
        id: entry.id,
        label: entry.name,
        searchText: entry.unit,
      })),
    [materialsData]
  );

  const materialsById = useMemo(
    () => new Map(materialsData.map((material) => [material.id, material])),
    [materialsData]
  );

  const getSupplierName = (id: string) => suppliers.find((supplier) => supplier.id === id)?.label || '';
  const getMaterial = (id: string) => materialsById.get(id);

  const getUnitCostPerBase = (line: LineItem) => {
    const material = getMaterial(line.materialId);
    if (!material) return null;
    const inputCost = parseFloat(line.unitCost);
    if (!inputCost || inputCost <= 0) return null;
    const selectedUom = material.materialUoms?.find((uom) =>
      line.quantityUomId ? uom.id === line.quantityUomId : uom.isBase
    );
    const factor = selectedUom?.factorToBase ?? 1;
    return inputCost / factor;
  };

  const updateLine = (id: string, field: keyof LineItem, value: string) => {
    setLines((prev) =>
      normalizeLines(
        prev.map((line) => {
          if (line.id !== id) return line;
          const updated = { ...line, [field]: value };

          if (field === 'materialId') {
            updated.quantityUomId = '';
            updated.warehouseId = '';
            if (value) {
              const material = materialsData.find((entry) => entry.id === value);
              if (material?.unitCost !== undefined) {
                updated.unitCost = String(material.unitCost);
              }
              if (material?.warehouseId && warehouses.some((warehouse) => warehouse.id === material.warehouseId)) {
                updated.warehouseId = material.warehouseId;
              }
            }
          }

          return updated;
        })
      )
    );
  };

  const lineTotal = (line: LineItem) => {
    const quantity = parseFloat(line.quantity) || 0;
    const unitCost = parseFloat(line.unitCost) || 0;
    return quantity * unitCost;
  };

  const validLines = useMemo(
    () => lines.filter((line) => line.materialId && parseFloat(line.quantity) > 0),
    [lines]
  );

  const duplicateMaterials = useMemo(
    () =>
      validLines
        .map((line) => line.materialId)
        .filter((id, index, array) => array.indexOf(id) !== index),
    [validLines]
  );

  const subTotal = useMemo(
    () => lines.reduce((sum, line) => sum + lineTotal(line), 0),
    [lines]
  );
  const taxAmount = includeTax ? subTotal * TAX_RATE : 0;
  const billAmount = subTotal + taxAmount;
  const totalQtyLines = validLines.length;
  const totalUnits = useMemo(
    () => validLines.reduce((sum, line) => sum + (parseFloat(line.quantity) || 0), 0),
    [validLines]
  );

  const tableColumns = useMemo<FlexibleTableColumn<LineItem>[]>(() => {
    const cols: FlexibleTableColumn<LineItem>[] = [
      {
        id: 'row',
        title: '#',
        align: 'left',
        defaultWidth: 70,
        minWidth: 56,
        maxWidth: 120,
        renderCell: (_line, index) => (
          <span className="text-xs font-mono text-slate-500 dark:text-slate-500">{index + 1}</span>
        ),
      },
      {
        id: 'material',
        title: 'Material',
        defaultWidth: 280,
        minWidth: 220,
        maxWidth: 520,
        renderCell: (line) => {
          const isDuplicate = duplicateMaterials.includes(line.materialId);
          return (
            <div>
              <SearchSelect
                value={line.materialId}
                onChange={(id) => updateLine(line.id, 'materialId', id)}
                placeholder="Search materials..."
                dropdownInPortal
                items={materialOptions}
                inputProps={{ className: tableInputClassName() }}
                renderItem={(item) => (
                  <div>
                    <div className="font-medium text-slate-900 dark:text-white">{item.label}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{item.searchText}</div>
                  </div>
                )}
              />
              {isDuplicate ? (
                <p className="text-xs text-red-600 dark:text-red-300">Duplicate material. Merge rows before posting.</p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'receivingUom',
        title: 'Receiving UOM',
        menuDescription: 'Unit used while receiving this material.',
        defaultWidth: 220,
        minWidth: 170,
        maxWidth: 340,
        renderCell: (line) => {
          const material = getMaterial(line.materialId);
          if (material?.materialUoms && material.materialUoms.length > 0) {
            return (
              <select
                value={line.quantityUomId}
                onChange={(e) => updateLine(line.id, 'quantityUomId', e.target.value)}
                className={tableInputClassName()}
              >
                {material.materialUoms.map((uom) => (
                  <option key={uom.id} value={uom.isBase ? '' : uom.id}>
                    {uom.unitName}
                    {uom.isBase ? ' (base)' : ` (=${uom.factorToBase} ${material.unit})`}
                  </option>
                ))}
              </select>
            );
          }
          return (
            <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              {material?.unit ?? '-'}
            </div>
          );
        },
      },
      {
        id: 'stock',
        title: 'Stock',
        menuDescription: 'Current stock before posting this receipt.',
        align: 'right',
        defaultWidth: 120,
        minWidth: 90,
        maxWidth: 220,
        renderCell: (line) => {
          const material = getMaterial(line.materialId);
          return material ? (
            <span className={material.currentStock <= 0 ? 'text-red-600 dark:text-red-300' : 'text-slate-700 dark:text-slate-300'}>
              {material.currentStock}
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">-</span>
          );
        },
      },
      {
        id: 'qty',
        title: 'Qty',
        menuDescription: 'Incoming quantity for this receipt line.',
        align: 'right',
        defaultWidth: 140,
        minWidth: 120,
        maxWidth: 260,
        renderCell: (line) => (
          <input
            type="number"
            min="0.001"
            step="0.001"
            placeholder="0.000"
            value={line.quantity}
            onChange={(e) => updateLine(line.id, 'quantity', e.target.value)}
            className={`${tableInputClassName()} text-right font-mono`}
          />
        ),
      },
    ];

    if (showWarehouseColumn) {
      cols.push({
        id: 'warehouse',
        title: 'Warehouse',
        menuDescription: 'Destination warehouse for the received stock.',
        defaultWidth: 230,
        minWidth: 180,
        maxWidth: 360,
        renderCell: (line) => {
          const material = getMaterial(line.materialId);
          return (
            <div>
              <select
                value={line.warehouseId}
                onChange={(e) => updateLine(line.id, 'warehouseId', e.target.value)}
                className={tableInputClassName()}
              >
                <option value="">Select warehouse...</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                    {material?.warehouseId === warehouse.id ? ' (default)' : ''}
                  </option>
                ))}
              </select>
              {material?.warehouseId && line.warehouseId === material.warehouseId ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Using material default warehouse</p>
              ) : null}
            </div>
          );
        },
      });
    }

    cols.push(
      {
        id: 'unitCost',
        title: 'Unit cost',
        menuDescription: 'Unit price entered for this receipt line.',
        align: 'right',
        defaultWidth: 140,
        minWidth: 120,
        maxWidth: 260,
        renderCell: (line) => (
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={line.unitCost}
            onChange={(e) => updateLine(line.id, 'unitCost', e.target.value)}
            className={`${tableInputClassName()} text-right font-mono`}
          />
        ),
      },
      {
        id: 'total',
        title: 'Total',
        menuDescription: 'Calculated line value from quantity and unit cost.',
        align: 'right',
        defaultWidth: 140,
        minWidth: 110,
        maxWidth: 260,
        renderCell: (line) => {
          const total = lineTotal(line);
          const perBase = getUnitCostPerBase(line);
          return (
            <div className="space-y-1">
              <span className="block font-mono font-medium text-slate-900 dark:text-white">
                {total > 0 ? total.toFixed(2) : '-'}
              </span>
              {perBase ? (
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  Base cost {perBase.toFixed(2)}
                </span>
              ) : null}
            </div>
          );
        },
      }
    );

    return cols;
  }, [duplicateMaterials, materialOptions, showWarehouseColumn, warehouses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canPost) {
      toast.error('You do not have permission to post receipts');
      return;
    }

    if (validLines.length === 0) {
      toast.error('Add at least one line item with material and quantity');
      return;
    }

    const normalizedReceiptNumber = receiptNumber.trim();
    if (!normalizedReceiptNumber) {
      toast.error('Receipt number is required');
      return;
    }

    if (duplicateMaterials.length > 0) {
      toast.error('Duplicate materials found. Merge them into one row.');
      return;
    }
    if (validLines.some((line) => !line.warehouseId)) {
      toast.error('Select a warehouse for each receipt line');
      return;
    }

    setSubmitting(true);

    try {
      if (isEditMode && editReceiptNumber) {
        await deleteReceiptEntry(editReceiptNumber).unwrap();
      }

      await addBatchTransaction({
        type: 'STOCK_IN',
        receiptNumber: normalizedReceiptNumber,
        supplier: getSupplierName(supplierId) || undefined,
        supplierId: supplierId || undefined,
        notes: notes || undefined,
        date,
        billAmount,
        includeTax,
        taxAmount,
        lines: validLines.map((line) => ({
          materialId: line.materialId,
          quantity: parseFloat(line.quantity),
          quantityUomId: line.quantityUomId.trim() || undefined,
          unitCost: line.unitCost ? parseFloat(line.unitCost) : undefined,
          warehouseId: line.warehouseId || undefined,
        })),
        materialUpdates: validLines
          .filter((line) => line.unitCost)
          .map((line) => ({
            materialId: line.materialId,
            unitCost: parseFloat(line.unitCost),
            quantityUomId: line.quantityUomId.trim() || undefined,
          })),
      }).unwrap();

      toast.success(
        isEditMode
          ? `Receipt updated. ${validLines.length} item(s) processed`
          : `Receipt posted. ${validLines.length} item(s) received`
      );
      router.push('/stock/goods-receipt');
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Submission failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href="/stock/goods-receipt"
            className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'h-auto p-0 text-xs font-medium uppercase tracking-wide')}
          >
            Receiving ledger
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {isEditMode ? 'Edit goods receipt' : 'Receive stock'}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isEditMode
              ? 'Adjust the receipt header, quantities, and costs before reposting inventory.'
              : 'Build one receipt with all incoming lines, then post stock and cost updates together.'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/stock/goods-receipt" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Back to history
          </Link>
          <Button type="button" size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Posting…' : isEditMode ? 'Update receipt' : 'Post receipt'}
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Receipt number',
            value: receiptNumber,
            note: isEditMode ? 'Locked to existing receipt record' : 'Editable before posting',
            mono: true,
          },
          {
            label: 'Supplier',
            value: getSupplierName(supplierId) || 'Not selected',
            note: 'Vendor linked to this receipt',
          },
          {
            label: 'Active lines',
            value: String(totalQtyLines),
            note: `${totalUnits.toFixed(2)} total quantity entered`,
          },
          {
            label: 'Bill amount',
            value: `AED ${billAmount.toFixed(2)}`,
            note: includeTax ? 'VAT included in final total' : 'VAT excluded from final total',
          },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p
                className={cn(
                  'mt-2 text-sm font-semibold text-foreground',
                  item.mono && 'font-mono text-base sm:text-sm',
                )}
              >
                {item.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.defaultPrevented) {
            const target = e.target as HTMLElement;
            if (target.tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }
        }}
        className="space-y-5"
      >
        <div className="space-y-5">
          <section className={shellClassName()}>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2">
                <SearchSelect
                  label="Supplier / vendor"
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder="Search suppliers..."
                  items={suppliers}
                  inputProps={{ className: inputClassName() }}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Receipt date
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClassName()}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Receipt No.
                </label>
                <input
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  required
                  disabled={isEditMode}
                  className={`${inputClassName()} font-mono disabled:cursor-not-allowed disabled:opacity-70`}
                />
              </div>

              <div className="md:col-span-2 xl:col-span-4">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Notes / remarks
                </label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional comments, bill reference, or receiving note"
                  className={inputClassName()}
                />
              </div>
            </div>
          </section>

          <section className={shellClassName()}>
            <FlexibleTable
              storageKey="goods-receipt-receive-lines-table"
              columns={tableColumns}
              rows={lines}
              rowKey={(line) => line.id}
              minTableWidthClassName="min-w-[980px]"
              title="Receiving lines"
              description={`Three draft rows stay ready while you work. ${totalQtyLines} active line${totalQtyLines === 1 ? '' : 's'} · ${totalUnits.toFixed(2)} total quantity.`}
              emptyState="No receipt lines yet."
              rowClassName={(line) => {
                const isDuplicate = duplicateMaterials.includes(line.materialId);
                return cn(
                  'border-b border-border transition-colors',
                  isDuplicate ? 'bg-destructive/10' : 'hover:bg-muted/50',
                );
              }}
            />
          </section>

          <section className={shellClassName()}>
            <div className="border-b border-border px-5 py-3">
              <h2 className={sectionHeadingClassName()}>Posting summary</h2>
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-start">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subtotal</p>
                  <p className="mt-1 text-sm font-medium text-foreground">AED {subTotal.toFixed(2)}</p>
                </div>

                <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={includeTax}
                    onChange={(e) => setIncludeTax(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">Include 5% VAT</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Tax is {includeTax ? 'added to' : 'excluded from'} the bill amount.
                    </span>
                  </span>
                </label>

                <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-mono text-foreground">AED {taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                    <span className="font-medium text-foreground">Bill amount</span>
                    <span className="font-mono text-lg font-semibold text-primary">AED {billAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 md:min-w-40">
                <Button type="submit" size="sm" disabled={submitting || !canPost}>
                  {submitting ? 'Posting…' : isEditMode ? 'Update receipt' : 'Post receipt'}
                </Button>
                <Link
                  href="/stock/goods-receipt"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full justify-center')}
                >
                  Cancel
                </Link>
              </div>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}

export default function ReceiveStockPage() {
  const searchParams = useSearchParams();
  const { data: suppliersData = [] } = useGetSuppliersQuery();

  const editReceiptNumber = searchParams.get('edit');
  const isEditMode = Boolean(editReceiptNumber);
  const { data: receiptEntry, isLoading } = useGetReceiptEntryQuery(editReceiptNumber ?? '', {
    skip: !isEditMode || !editReceiptNumber,
  });

  const initialSupplierId = receiptEntry?.supplier
    ? suppliersData.find((supplier) => supplier.name === receiptEntry.supplier)?.id || ''
    : '';

  const initialLines = useMemo<LineItem[]>(() => {
    if (!receiptEntry?.materials?.length) return [emptyLine()];
    return receiptEntry.materials.map((line, index) => ({
      id: `line-${index}`,
      materialId: line.materialId || '',
      quantity: String(line.quantityReceived || ''),
      quantityUomId: '',
      unitCost: String(line.unitCost || ''),
      warehouseId: line.warehouseId || '',
    }));
  }, [receiptEntry]);

  if (isEditMode && isLoading) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <p className="text-sm text-muted-foreground">Loading receipt…</p>
      </div>
    );
  }

  if (isEditMode && editReceiptNumber && !receiptEntry) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert variant="destructive">
          <AlertDescription>Receipt not found.</AlertDescription>
        </Alert>
        <Link href="/stock/goods-receipt" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'w-fit')}>
          Back to history
        </Link>
      </div>
    );
  }

  if (isEditMode && receiptEntry?.status === 'cancelled') {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertTitle>Receipt cancelled</AlertTitle>
          <AlertDescription>
            This receipt was already cancelled and can no longer be edited. Open the receipt history if you need to review
            the reversal trail.
          </AlertDescription>
        </Alert>
        <Link href="/stock/goods-receipt" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-fit')}>
          Back to history
        </Link>
      </div>
    );
  }

  return (
    <ReceiptEditor
      key={editReceiptNumber ?? 'new'}
      initialReceiptNumber={receiptEntry?.receiptNumber || buildDraftReceiptNumber()}
      initialSupplierId={initialSupplierId}
      initialDate={receiptEntry ? new Date(receiptEntry.receivedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
      initialNotes={receiptEntry?.notes || ''}
      initialLines={initialLines}
      isEditMode={isEditMode}
      editReceiptNumber={editReceiptNumber}
    />
  );
}
