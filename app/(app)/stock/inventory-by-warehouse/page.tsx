'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import DirectoryListPagination from '@/components/ui/DirectoryListPagination';
import ResponsiveDialog from '@/components/ui/ResponsiveDialog';
import { Button } from '@/components/ui/shadcn/button';
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import {
  downloadItemwiseStocklistExcel,
  downloadItemwiseStocklistPdf,
  type ItemwiseStocklistRow,
  type ItemwiseStocklistWarehouse,
} from '@/lib/stock/itemwiseStocklistExport';
import { useGetInventoryByWarehousePageQuery } from '@/store/hooks';

function roundQty(value: number) {
  return Number(value.toFixed(3));
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function systemDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function InventoryByWarehousePage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView =
    isSA ||
    perms.includes('material.view') ||
    perms.includes('transaction.stock_in') ||
    perms.includes('transaction.stock_out');

  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, warehouseFilter, pageSize]);

  const { data, isFetching, isError, refetch } = useGetInventoryByWarehousePageQuery(
    {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      search: deferredSearch,
      warehouseId: warehouseFilter,
    },
    { skip: !canView },
  );

  const warehouseColumns = data?.warehouseColumns ?? [];
  const rows = data?.rows ?? [];
  const totalRows = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pageStart = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, totalRows);

  async function downloadStocklist(format: 'excel' | 'pdf') {
    setExporting(format);
    try {
      const params = new URLSearchParams();
      if (deferredSearch.trim()) params.set('search', deferredSearch.trim());
      if (warehouseFilter !== 'all') params.set('warehouseId', warehouseFilter);
      const query = params.toString();
      const res = await fetch(`/api/reports/inventory-by-warehouse${query ? `?${query}` : ''}`);
      const json = (await res.json().catch(() => null)) as {
        data?: {
          currencyCode?: string;
          warehouseColumns?: ItemwiseStocklistWarehouse[];
          rows?: ItemwiseStocklistRow[];
        };
        error?: string;
      } | null;
      if (!res.ok) {
        toast.error(json?.error || 'Could not build the stocklist');
        return;
      }
      const warehouses = (json?.data?.warehouseColumns ?? []).filter(
        (warehouse) => warehouseFilter === 'all' || warehouse.id === warehouseFilter,
      );
      const rows = json?.data?.rows ?? [];
      const fileName = `itemwise-stocklist-${systemDateStamp()}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      const payload = {
        currencyCode: json?.data?.currencyCode || 'AED',
        warehouses,
        rows,
        fileName,
      };
      if (format === 'excel') downloadItemwiseStocklistExcel(payload);
      else await downloadItemwiseStocklistPdf(payload);
      toast.success(format === 'excel' ? 'Excel downloaded' : 'PDF downloaded');
      setExportOpen(false);
    } catch {
      toast.error('Could not build the stocklist');
    } finally {
      setExporting(null);
    }
  }

  const visibleWarehouses = useMemo(() => {
    if (warehouseFilter === 'all') return warehouseColumns;
    return warehouseColumns.filter((w) => w.id === warehouseFilter);
  }, [warehouseColumns, warehouseFilter]);

  const currencyCode = data?.currencyCode || 'AED';
  const tableLines = useMemo(
    () =>
      rows.map((row) => {
        const qtys = visibleWarehouses.map((warehouse) => roundQty(row.qtyByWarehouseId[warehouse.id] ?? 0));
        const total = roundQty(qtys.reduce((sum, qty) => sum + qty, 0));
        return {
          ...row,
          qtys,
          total,
          value: roundMoney(total * row.unitCost),
        };
      }),
    [rows, visibleWarehouses],
  );
  const pageValue = roundMoney(tableLines.reduce((sum, line) => sum + line.value, 0));
  const columnCount = 5 + visibleWarehouses.length;

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Inventory by warehouse</h1>
        <div className="py-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">You do not have permission to view this report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300/80">
            Stock report
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
            Inventory by warehouse
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
            Each item is one row. Warehouse columns show quantity, including zero. Total is the quantity on this
            sheet, and value is that total times the unit cost.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Search material</label>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name…"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="min-w-[200px]">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Warehouse focus</label>
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All warehouses</option>
                {warehouseColumns.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Itemwise stocklist
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load data. Try refresh.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                    <th className="sticky left-0 z-20 min-w-[220px] border-r border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/95">
                      Item
                    </th>
                    <th className="min-w-[72px] border-r border-slate-200 px-3 py-3 dark:border-slate-800">Unit</th>
                    {visibleWarehouses.map((w) => (
                      <th key={w.id} className="min-w-[110px] border-r border-slate-200 px-3 py-3 text-right dark:border-slate-800">
                        {w.name}
                      </th>
                    ))}
                    <th className="min-w-[88px] border-r border-slate-200 px-3 py-3 text-right dark:border-slate-800">
                      Total
                    </th>
                    <th className="min-w-[120px] border-r border-slate-200 px-3 py-3 text-right dark:border-slate-800">
                      Last purchase price
                    </th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Value ({currencyCode})</th>
                  </tr>
                </thead>
                <tbody>
                  {isFetching && tableLines.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columnCount}
                        className="px-4 py-10 text-center text-slate-500 dark:text-slate-400"
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : tableLines.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columnCount}
                        className="px-4 py-10 text-center text-slate-500 dark:text-slate-400"
                      >
                        No rows match your filters, or there is no on-hand stock in any warehouse yet.
                      </td>
                    </tr>
                  ) : (
                    tableLines.map((row) => (
                      <tr
                        key={row.materialId}
                        className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40"
                      >
                        <td className="sticky left-0 z-10 border-r border-slate-200 bg-inherit px-3 py-2.5 font-medium dark:border-slate-800">
                          <Link
                            href={`/stock/materials/${row.materialId}`}
                            className="text-emerald-700 hover:underline dark:text-emerald-300"
                          >
                            {row.materialName}
                          </Link>
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2.5 text-slate-600 dark:border-slate-800 dark:text-slate-400">
                          {row.unit}
                        </td>
                        {row.qtys.map((qty, index) => (
                          <td
                            key={visibleWarehouses[index]?.id ?? index}
                            className="border-r border-slate-200 px-3 py-2.5 text-right tabular-nums text-slate-900 dark:border-slate-800 dark:text-white"
                          >
                            {formatQty(qty)}
                          </td>
                        ))}
                        <td className="border-r border-slate-200 px-3 py-2.5 text-right tabular-nums font-medium text-slate-900 dark:border-slate-800 dark:text-white">
                          {formatQty(row.total)}
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2.5 text-right tabular-nums text-slate-900 dark:border-slate-800 dark:text-white">
                          {row.lastPurchasePrice == null ? '' : formatMoney(row.lastPurchasePrice)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">
                          {formatMoney(row.value)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {tableLines.length > 0 ? (
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 text-sm font-semibold dark:border-slate-800 dark:bg-slate-900/80">
                      <td className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/95">
                        {totalPages > 1 ? 'Total value (this page)' : 'Total value'}
                      </td>
                      <td className="border-r border-slate-200 dark:border-slate-800" />
                      {visibleWarehouses.map((warehouse) => (
                        <td key={warehouse.id} className="border-r border-slate-200 dark:border-slate-800" />
                      ))}
                      <td className="border-r border-slate-200 dark:border-slate-800" />
                      <td className="border-r border-slate-200 dark:border-slate-800" />
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(pageValue)}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </div>
        {totalRows > 0 ? (
          <DirectoryListPagination
            className="border-t border-slate-200 px-4 py-3 dark:border-slate-800"
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            total={totalRows}
            pageStart={pageStart}
            pageEnd={pageEnd}
            pageSizeOptions={LIST_PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        ) : null}
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-500">
        For FIFO layers and receipt-level detail, open{' '}
        <Link href="/stock/stock-batches" className="text-emerald-700 underline dark:text-emerald-300">
          Stock batches
        </Link>
        . Showing {totalRows} material{totalRows === 1 ? '' : 's'} matching filters.
      </p>

      <ResponsiveDialog open={exportOpen} onClose={() => { if (!exporting) setExportOpen(false); }} size="sm">
        <div className="px-5 py-5">
          <h2 className="text-lg font-semibold text-foreground">Itemwise stocklist</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each item is one row. Every warehouse has a quantity column, and zero is shown as 0, followed by the total quantity, last purchase price, and value.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" disabled={exporting !== null} onClick={() => void downloadStocklist('excel')}>
              {exporting === 'excel' ? 'Preparing…' : 'Excel'}
            </Button>
            <Button type="button" disabled={exporting !== null} onClick={() => void downloadStocklist('pdf')}>
              {exporting === 'pdf' ? 'Preparing…' : 'PDF'}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
