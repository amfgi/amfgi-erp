'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import toast from 'react-hot-toast';
import type { Column } from '@/components/ui/DataTable';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import {
  useGetUnitsQuery,
  useCreateUnitMutation,
  useUpdateUnitMutation,
  useDeleteUnitMutation,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useGetWarehousesQuery,
  useCreateWarehouseMutation,
  useUpdateWarehouseMutation,
  useDeleteWarehouseMutation,
  type Unit,
  type Category,
  type Warehouse,
} from '@/store/hooks';

const MASTER_TABS = [
  { id: 'units', label: 'Units', description: 'Material measurement labels' },
  { id: 'categories', label: 'Categories', description: 'Material master groupings' },
  { id: 'warehouses', label: 'Warehouses', description: 'Stock holding locations' },
] as const;

type MasterTabId = (typeof MASTER_TABS)[number]['id'];

function StockMasterDataContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openMenu: openContextMenu } = useGlobalContextMenu();

  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canUse =
    isSA || perms.includes('settings.manage') || perms.includes('material.view');

  const [activeTab, setActiveTab] = useState<MasterTabId>('units');

  const { data: units = [], isFetching: unitsFetching } = useGetUnitsQuery(undefined, {
    skip: !canUse,
    refetchOnMountOrArgChange: 30,
  });
  const [createUnit] = useCreateUnitMutation();
  const [updateUnit] = useUpdateUnitMutation();
  const [deleteUnit] = useDeleteUnitMutation();
  const [unitModal, setUnitModal] = useState<{ open: boolean; item: Unit | null }>({ open: false, item: null });
  const [unitForm, setUnitForm] = useState({ name: '' });
  const [unitDeleteModal, setUnitDeleteModal] = useState<{ open: boolean; item: Unit | null; linkedCount: number }>({
    open: false,
    item: null,
    linkedCount: 0,
  });

  const { data: categories = [], isFetching: categoriesFetching } = useGetCategoriesQuery(undefined, {
    skip: !canUse,
    refetchOnMountOrArgChange: 30,
  });
  const [createCategory] = useCreateCategoryMutation();
  const [updateCategory] = useUpdateCategoryMutation();
  const [deleteCategory] = useDeleteCategoryMutation();
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; item: Category | null }>({ open: false, item: null });
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [categoryDeleteModal, setCategoryDeleteModal] = useState<{ open: boolean; item: Category | null; linkedCount: number }>({
    open: false,
    item: null,
    linkedCount: 0,
  });

  const { data: warehouses = [], isFetching: warehousesFetching } = useGetWarehousesQuery(undefined, {
    skip: !canUse,
    refetchOnMountOrArgChange: 30,
  });
  const [createWarehouse] = useCreateWarehouseMutation();
  const [updateWarehouse] = useUpdateWarehouseMutation();
  const [deleteWarehouse] = useDeleteWarehouseMutation();
  const [warehouseModal, setWarehouseModal] = useState<{ open: boolean; item: Warehouse | null }>({ open: false, item: null });
  const [warehouseForm, setWarehouseForm] = useState({ name: '', location: '' });
  const [warehouseDeleteModal, setWarehouseDeleteModal] = useState<{ open: boolean; item: Warehouse | null; linkedCount: number }>({
    open: false,
    item: null,
    linkedCount: 0,
  });

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (MASTER_TABS.some((item) => item.id === tab)) {
      setActiveTab(tab as MasterTabId);
    }
  }, [searchParams]);

  useEffect(() => {
    router.replace(`/stock/master-data?tab=${activeTab}`, { scroll: false });
  }, [activeTab, router]);

  const extractMutationErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === 'object' && 'data' in error) {
      const data = (error as { data?: unknown }).data;
      if (data && typeof data === 'object' && 'error' in data) {
        const message = (data as { error?: unknown }).error;
        if (typeof message === 'string' && message.trim()) return message;
      }
    }
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
  };

  const handleUnitContextMenu = useCallback(
    (unit: Unit, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const options: ContextMenuOption[] = [
        {
          label: 'Edit',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          ),
          action: () => {
            setUnitForm({ name: unit.name });
            setUnitModal({ open: true, item: unit });
          },
        },
        { divider: true },
        {
          label: 'Delete',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          ),
          action: () => setUnitDeleteModal({ open: true, item: unit, linkedCount: 0 }),
          danger: true,
        },
      ];

      openContextMenu(e.clientX, e.clientY, options);
    },
    [openContextMenu]
  );

  const handleUnitSave = async () => {
    if (!unitForm.name.trim()) {
      toast.error('Unit name is required');
      return;
    }

    try {
      if (unitModal.item) {
        await updateUnit({ id: unitModal.item.id, name: unitForm.name.trim() }).unwrap();
        toast.success('Unit updated successfully');
      } else {
        await createUnit({ name: unitForm.name.trim() }).unwrap();
        toast.success('Unit created successfully');
      }
      setUnitModal({ open: false, item: null });
      setUnitForm({ name: '' });
    } catch (err: unknown) {
      toast.error(extractMutationErrorMessage(err, 'Operation failed'));
    }
  };

  const handleUnitDelete = async () => {
    if (!unitDeleteModal.item) return;
    try {
      await deleteUnit(unitDeleteModal.item.id).unwrap();
      toast.success('Unit deleted successfully');
      setUnitDeleteModal({ open: false, item: null, linkedCount: 0 });
    } catch (err: unknown) {
      const error = extractMutationErrorMessage(err, 'Failed to delete unit');
      if (error.includes('material')) {
        setUnitDeleteModal((prev) => ({
          ...prev,
          linkedCount: parseInt(error.match(/\d+/)?.[0] ?? '0'),
        }));
        toast.error(error);
      } else {
        toast.error(error);
      }
    }
  };

  const handleCategoryContextMenu = useCallback(
    (category: Category, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const options: ContextMenuOption[] = [
        {
          label: 'Edit',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          ),
          action: () => {
            setCategoryForm({ name: category.name });
            setCategoryModal({ open: true, item: category });
          },
        },
        { divider: true },
        {
          label: 'Delete',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          ),
          action: () => setCategoryDeleteModal({ open: true, item: category, linkedCount: 0 }),
          danger: true,
        },
      ];

      openContextMenu(e.clientX, e.clientY, options);
    },
    [openContextMenu]
  );

  const handleCategorySave = async () => {
    if (!categoryForm.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      if (categoryModal.item) {
        await updateCategory({ id: categoryModal.item.id, name: categoryForm.name.trim() }).unwrap();
        toast.success('Category updated successfully');
      } else {
        await createCategory({ name: categoryForm.name.trim() }).unwrap();
        toast.success('Category created successfully');
      }
      setCategoryModal({ open: false, item: null });
      setCategoryForm({ name: '' });
    } catch (err: unknown) {
      toast.error(extractMutationErrorMessage(err, 'Operation failed'));
    }
  };

  const handleCategoryDelete = async () => {
    if (!categoryDeleteModal.item) return;
    try {
      await deleteCategory(categoryDeleteModal.item.id).unwrap();
      toast.success('Category deleted successfully');
      setCategoryDeleteModal({ open: false, item: null, linkedCount: 0 });
    } catch (err: unknown) {
      const error = extractMutationErrorMessage(err, 'Failed to delete category');
      if (error.includes('material')) {
        setCategoryDeleteModal((prev) => ({
          ...prev,
          linkedCount: parseInt(error.match(/\d+/)?.[0] ?? '0'),
        }));
        toast.error(error);
      } else {
        toast.error(error);
      }
    }
  };

  const handleWarehouseContextMenu = useCallback(
    (warehouse: Warehouse, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const options: ContextMenuOption[] = [
        {
          label: 'Edit',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          ),
          action: () => {
            setWarehouseForm({ name: warehouse.name, location: warehouse.location || '' });
            setWarehouseModal({ open: true, item: warehouse });
          },
        },
        { divider: true },
        {
          label: 'Delete',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          ),
          action: () => setWarehouseDeleteModal({ open: true, item: warehouse, linkedCount: 0 }),
          danger: true,
        },
      ];

      openContextMenu(e.clientX, e.clientY, options);
    },
    [openContextMenu]
  );

  const handleWarehouseSave = async () => {
    if (!warehouseForm.name.trim()) {
      toast.error('Warehouse name is required');
      return;
    }

    try {
      if (warehouseModal.item) {
        await updateWarehouse({
          id: warehouseModal.item.id,
          name: warehouseForm.name.trim(),
          location: warehouseForm.location.trim() || undefined,
        }).unwrap();
        toast.success('Warehouse updated successfully');
      } else {
        await createWarehouse({
          name: warehouseForm.name.trim(),
          location: warehouseForm.location.trim() || undefined,
        }).unwrap();
        toast.success('Warehouse created successfully');
      }
      setWarehouseModal({ open: false, item: null });
      setWarehouseForm({ name: '', location: '' });
    } catch (err: unknown) {
      toast.error(extractMutationErrorMessage(err, 'Operation failed'));
    }
  };

  const handleWarehouseDelete = async () => {
    if (!warehouseDeleteModal.item) return;
    try {
      await deleteWarehouse(warehouseDeleteModal.item.id).unwrap();
      toast.success('Warehouse deleted successfully');
      setWarehouseDeleteModal({ open: false, item: null, linkedCount: 0 });
    } catch (err: unknown) {
      const error = extractMutationErrorMessage(err, 'Failed to delete warehouse');
      if (error.includes('material')) {
        setWarehouseDeleteModal((prev) => ({
          ...prev,
          linkedCount: parseInt(error.match(/\d+/)?.[0] ?? '0'),
        }));
        toast.error(error);
      } else {
        toast.error(error);
      }
    }
  };

  const unitColumns: Column<Unit>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (unit) => <span className="font-mono text-emerald-400">{unit.name}</span>,
    },
  ];

  const categoryColumns: Column<Category>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (category) => <span className="font-mono text-emerald-400">{category.name}</span>,
    },
  ];

  const warehouseColumns: Column<Warehouse>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (warehouse) => <span className="font-mono text-emerald-400">{warehouse.name}</span>,
    },
    {
      key: 'location',
      header: 'Location',
      render: (warehouse) => warehouse.location || '-',
    },
  ];

  const activeTabMeta = MASTER_TABS.find((tab) => tab.id === activeTab) ?? MASTER_TABS[0];

  if (!canUse) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-6 py-12 text-center">
        <h1 className="text-2xl font-semibold text-white">Stock master data</h1>
        <p className="mt-3 text-sm text-slate-400">You do not have permission to view units, categories, or warehouses.</p>
        <Link href="/stock" className="mt-4 inline-block text-emerald-400 hover:text-emerald-300 text-sm">
          ← Back to Stock
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400/90">Stock</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Master data</h1>
          <p className="mt-1 text-sm text-slate-400">
            Units, categories, and warehouses used across materials and stock movements.
          </p>
        </div>
        <Link href="/stock">
          <Button variant="secondary">Back to Stock</Button>
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2 border-b border-slate-700 pb-3 mb-4">
          {MASTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-3 py-2 text-left text-sm transition ${
                activeTab === tab.id
                  ? 'bg-emerald-500/15 text-white ring-1 ring-emerald-500/40'
                  : 'bg-transparent text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mb-4">
          <span className="font-medium text-slate-300">{activeTabMeta.label}</span> — {activeTabMeta.description}
        </p>

        {activeTab === 'units' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Units</h2>
              <Button
                onClick={() => {
                  setUnitForm({ name: '' });
                  setUnitModal({ open: true, item: null });
                }}
              >
                + Add Unit
              </Button>
            </div>
            <p className="text-sm text-slate-400 -mt-2 mb-2">
              Create labels like kg, drum, pallet here. On each material, set the <span className="text-slate-300">base unit</span>{' '}
              (stock unit), then add conversions under Materials → edit material.
            </p>
            {unitsFetching && units.length === 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full">
                  <tbody>
                    <TableSkeleton rows={5} columns={unitColumns.length} />
                  </tbody>
                </table>
              </div>
            ) : (
              <DataTable
                columns={unitColumns}
                data={units}
                loading={unitsFetching && units.length === 0}
                emptyText="No units found. Create one to get started."
                searchKeys={['name']}
                onRowContextMenu={handleUnitContextMenu}
              />
            )}
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Categories</h2>
              <Button
                onClick={() => {
                  setCategoryForm({ name: '' });
                  setCategoryModal({ open: true, item: null });
                }}
              >
                + Add Category
              </Button>
            </div>
            {categoriesFetching && categories.length === 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full">
                  <tbody>
                    <TableSkeleton rows={5} columns={categoryColumns.length} />
                  </tbody>
                </table>
              </div>
            ) : (
              <DataTable
                columns={categoryColumns}
                data={categories}
                loading={categoriesFetching && categories.length === 0}
                emptyText="No categories found. Create one to get started."
                searchKeys={['name']}
                onRowContextMenu={handleCategoryContextMenu}
              />
            )}
          </div>
        )}

        {activeTab === 'warehouses' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Warehouses</h2>
              <Button
                onClick={() => {
                  setWarehouseForm({ name: '', location: '' });
                  setWarehouseModal({ open: true, item: null });
                }}
              >
                + Add Warehouse
              </Button>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-4 text-sm text-slate-400">
              <p>Warehouse tracking is required. Every stock movement must select a warehouse.</p>
            </div>
            {warehousesFetching && warehouses.length === 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full">
                  <tbody>
                    <TableSkeleton rows={5} columns={warehouseColumns.length} />
                  </tbody>
                </table>
              </div>
            ) : (
              <DataTable
                columns={warehouseColumns}
                data={warehouses}
                loading={warehousesFetching && warehouses.length === 0}
                emptyText="No warehouses found. Create one to get started."
                searchKeys={['name', 'location']}
                onRowContextMenu={handleWarehouseContextMenu}
              />
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={unitModal.open}
        onClose={() => setUnitModal({ open: false, item: null })}
        title={unitModal.item ? 'Edit Unit' : 'Create Unit'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleUnitSave();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Unit Name *</label>
            <input
              type="text"
              value={unitForm.name}
              onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
              placeholder="e.g., kilogram, piece, meter"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              autoFocus
              required
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-700">
            <Button type="button" variant="ghost" onClick={() => setUnitModal({ open: false, item: null })} fullWidth>
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              {unitModal.item ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={categoryModal.open}
        onClose={() => setCategoryModal({ open: false, item: null })}
        title={categoryModal.item ? 'Edit Category' : 'Create Category'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCategorySave();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Category Name *</label>
            <input
              type="text"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              placeholder="e.g., Raw Materials, Finished Goods"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              autoFocus
              required
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-700">
            <Button type="button" variant="ghost" onClick={() => setCategoryModal({ open: false, item: null })} fullWidth>
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              {categoryModal.item ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={warehouseModal.open}
        onClose={() => setWarehouseModal({ open: false, item: null })}
        title={warehouseModal.item ? 'Edit Warehouse' : 'Create Warehouse'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleWarehouseSave();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Warehouse Name *</label>
            <input
              type="text"
              value={warehouseForm.name}
              onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
              placeholder="e.g., Main Warehouse, Branch Office"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Location</label>
            <input
              type="text"
              value={warehouseForm.location}
              onChange={(e) => setWarehouseForm({ ...warehouseForm, location: e.target.value })}
              placeholder="Optional location address"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-700">
            <Button type="button" variant="ghost" onClick={() => setWarehouseModal({ open: false, item: null })} fullWidth>
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              {warehouseModal.item ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      {unitDeleteModal.open && unitDeleteModal.item && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setUnitDeleteModal({ open: false, item: null, linkedCount: 0 })} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Unit</h2>
            <p className="text-slate-300 text-sm mb-4">
              Are you sure you want to delete <strong>{unitDeleteModal.item.name}</strong>?
            </p>
            {unitDeleteModal.linkedCount > 0 && (
              <div className="bg-red-950/30 border border-red-900 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-300">
                  Warning: {unitDeleteModal.linkedCount} material{unitDeleteModal.linkedCount !== 1 ? 's' : ''}{' '}
                  {unitDeleteModal.linkedCount === 1 ? 'uses' : 'use'} this unit.
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setUnitDeleteModal({ open: false, item: null, linkedCount: 0 })}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleUnitDelete()}
                disabled={unitDeleteModal.linkedCount > 0}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}

      {categoryDeleteModal.open && categoryDeleteModal.item && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setCategoryDeleteModal({ open: false, item: null, linkedCount: 0 })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Category</h2>
            <p className="text-slate-300 text-sm mb-4">
              Are you sure you want to delete <strong>{categoryDeleteModal.item.name}</strong>?
            </p>
            {categoryDeleteModal.linkedCount > 0 && (
              <div className="bg-red-950/30 border border-red-900 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-300">
                  Warning: {categoryDeleteModal.linkedCount} material{categoryDeleteModal.linkedCount !== 1 ? 's' : ''}{' '}
                  {categoryDeleteModal.linkedCount === 1 ? 'uses' : 'use'} this category.
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setCategoryDeleteModal({ open: false, item: null, linkedCount: 0 })}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCategoryDelete()}
                disabled={categoryDeleteModal.linkedCount > 0}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}

      {warehouseDeleteModal.open && warehouseDeleteModal.item && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setWarehouseDeleteModal({ open: false, item: null, linkedCount: 0 })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Warehouse</h2>
            <p className="text-slate-300 text-sm mb-4">
              Are you sure you want to delete <strong>{warehouseDeleteModal.item.name}</strong>?
            </p>
            {warehouseDeleteModal.linkedCount > 0 && (
              <div className="bg-red-950/30 border border-red-900 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-300">
                  Warning: {warehouseDeleteModal.linkedCount} material{warehouseDeleteModal.linkedCount !== 1 ? 's' : ''}{' '}
                  {warehouseDeleteModal.linkedCount === 1 ? 'uses' : 'use'} this warehouse.
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setWarehouseDeleteModal({ open: false, item: null, linkedCount: 0 })}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleWarehouseDelete()}
                disabled={warehouseDeleteModal.linkedCount > 0}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function StockMasterDataPage() {
  return (
    <Suspense fallback={<div className="text-slate-400 p-6">Loading…</div>}>
      <StockMasterDataContent />
    </Suspense>
  );
}
