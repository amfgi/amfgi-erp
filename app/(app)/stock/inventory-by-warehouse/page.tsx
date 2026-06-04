'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import DirectoryListPagination from '@/components/ui/DirectoryListPagination';
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { useGetInventoryByWarehousePageQuery } from '@/store/hooks';

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function qtyMismatch(a: number, b: number) {
  return Math.abs(a - b) > 0.0005;
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

  const visibleWarehouses = useMemo(() => {
    if (warehouseFilter === 'all') return warehouseColumns;
    return warehouseColumns.filter((w) => w.id === warehouseFilter);
  }, [warehouseColumns, warehouseFilter]);

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
            Quantities come from live{' '}
            <span className="font-medium text-slate-800 dark:text-slate-200">material × warehouse</span> balances
            updated on every receipt and dispatch. Company total is the material master balance; split is the sum of
            warehouse cells — they should match; if not, use stock batches or support to investigate.
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
                      Material
                    </th>
                    <th className="min-w-[72px] px-3 py-3">Unit</th>
                    <th className="min-w-[100px] px-3 py-3 text-right">Company total</th>
                    <th className="min-w-[100px] border-r border-slate-200 px-3 py-3 text-right dark:border-slate-800">
                      Split sum
                    </th>
                    {visibleWarehouses.map((w) => (
                      <th key={w.id} className="min-w-[110px] px-3 py-3 text-right whitespace-nowrap">
                        {w.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isFetching && rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4 + visibleWarehouses.length}
                        className="px-4 py-10 text-center text-slate-500 dark:text-slate-400"
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4 + visibleWarehouses.length}
                        className="px-4 py-10 text-center text-slate-500 dark:text-slate-400"
                      >
                        No rows match your filters, or there is no on-hand stock in any warehouse yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
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
                          {qtyMismatch(row.companyTotal, row.splitTotal) ? (
                            <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                              Mismatch
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{row.unit}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">
                          {formatQty(row.companyTotal)}
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2.5 text-right tabular-nums text-slate-700 dark:border-slate-800 dark:text-slate-300">
                          {formatQty(row.splitTotal)}
                        </td>
                        {visibleWarehouses.map((w) => {
                          const q = row.qtyByWarehouseId[w.id] ?? 0;
                          return (
                            <td
                              key={w.id}
                              className={`px-3 py-2.5 text-right tabular-nums ${
                                q > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600'
                              }`}
                            >
                              {q > 0 ? formatQty(q) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
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
    </div>
  );
}
