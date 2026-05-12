'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import Modal from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import { cn } from '@/lib/utils';
import {
  useDeleteSupplierMutation,
  useGetSuppliersQuery,
  type Supplier,
} from '@/store/hooks';

type SupplierSourceFilter = 'all' | 'local' | 'synced';

type DeleteCheck = {
  source: string;
  canDelete: boolean;
  canHardDelete: boolean;
  canDeactivate: boolean;
  deleteBlockedReason?: string;
  linkedBatchesCount: number;
};

function extractApiErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value?: string | Date | null) {
  if (!value) return 'Not set';
  const parsed = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleDateString();
}

function deleteModalCopy(check: DeleteCheck | null) {
  if (!check) return 'Checking delete rules...';
  if (check.deleteBlockedReason === 'synced_from_party_api') {
    return 'This supplier came from the party API. It cannot be deleted here; edit the record and deactivate it if needed.';
  }
  if (check.canHardDelete) {
    return 'This supplier is not linked to stock batches and will be permanently deleted.';
  }
  if (check.canDeactivate) {
    return `This supplier is linked to ${check.linkedBatchesCount} stock batch(es), so it will be marked inactive instead of being removed.`;
  }
  return 'This supplier cannot be deleted from here.';
}

export default function SuppliersPage() {
  const { data: session } = useSession();
  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canCreateSupplier = isSA || perms.includes('transaction.stock_in');

  const { data: suppliers = [], isFetching, error } = useGetSuppliersQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const [deleteSupplier, { isLoading: isDeleting }] = useDeleteSupplierMutation();

  const [supplierSourceMode, setSupplierSourceMode] = useState<'HYBRID' | 'EXTERNAL_ONLY' | 'INTERNAL_ONLY'>('HYBRID');

  useEffect(() => {
    if (!session?.user?.activeCompanyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && res.ok && json?.success) {
          const m = json.data?.supplierSourceMode;
          setSupplierSourceMode(
            m === 'EXTERNAL_ONLY' || m === 'INTERNAL_ONLY' || m === 'HYBRID' ? m : 'HYBRID',
          );
        }
      } catch {
        if (!cancelled) setSupplierSourceMode('HYBRID');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.activeCompanyId]);

  const canCreateLocalSupplier = canCreateSupplier && supplierSourceMode !== 'EXTERNAL_ONLY';

  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SupplierSourceFilter>('all');
  const [cityFilter, setCityFilter] = useState('');
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    supplier: Supplier | null;
    check: DeleteCheck | null;
    loading: boolean;
  }>({ open: false, supplier: null, check: null, loading: false });

  const deferredQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  const cities = useMemo(
    () =>
      Array.from(new Set(suppliers.map((supplier) => supplier.city).filter(Boolean) as string[])).sort(),
    [suppliers],
  );

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      if (!supplier.isActive) return false;
      if (
        deferredQuery &&
        ![
          supplier.name,
          supplier.email,
          supplier.contactPerson,
          supplier.phone,
          supplier.externalPartyId?.toString() ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(deferredQuery)
      ) {
        return false;
      }
      if (sourceFilter === 'local' && supplier.source === 'PARTY_API_SYNC') return false;
      if (sourceFilter === 'synced' && supplier.source !== 'PARTY_API_SYNC') return false;
      if (cityFilter && supplier.city !== cityFilter) return false;
      return true;
    });
  }, [cityFilter, deferredQuery, sourceFilter, suppliers]);

  const openDeleteModal = async (supplier: Supplier) => {
    setDeleteModal({
      open: true,
      supplier,
      check: null,
      loading: true,
    });

    try {
      const response = await fetch(`/api/suppliers/${supplier.id}/check-delete`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Failed to check delete rules');
      }
      setDeleteModal({
        open: true,
        supplier,
        check: json.data as DeleteCheck,
        loading: false,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to check delete rules');
      setDeleteModal({
        open: true,
        supplier,
        check: null,
        loading: false,
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteModal.supplier) return;

    try {
      const result = await deleteSupplier(deleteModal.supplier.id).unwrap();
      toast.success(result.message ?? (result.permanent ? 'Supplier deleted' : 'Supplier deactivated'));
      setDeleteModal({ open: false, supplier: null, check: null, loading: false });
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Failed to delete supplier'));
    }
  };

  const tableHeaders = ['Supplier', 'Source', 'External ID', 'Primary contact', 'Compliance', 'Location', 'Actions'];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Master data</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Supplier directory</h1>
          <p className="text-sm text-muted-foreground">
            Manage suppliers and open dedicated create and edit pages for full compliance field entry.
          </p>
        </div>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {compactNumber(suppliers.length)} supplier{suppliers.length === 1 ? '' : 's'}
        </p>
      </header>

      {supplierSourceMode === 'EXTERNAL_ONLY' ? (
        <Alert>
          <AlertDescription>
            Manual supplier creation is disabled: this company uses external-only suppliers. Add suppliers via the
            integration API or party lists sync from company settings.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid min-w-0 flex-1 gap-4 md:grid-cols-[minmax(0,1.6fr)_12rem_12rem]">
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name, email, contact, phone, or external ID"
              />
            </div>
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Source</span>
              <Select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as SupplierSourceFilter)}
              >
                <option value="all">All sources</option>
                <option value="local">Local only</option>
                <option value="synced">Synced only</option>
              </Select>
            </div>
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">City</span>
              <Select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
                <option value="">All cities</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {canCreateLocalSupplier ? (
              <Link href="/suppliers/new" className={buttonVariants({ size: 'sm' })}>
                New supplier
              </Link>
            ) : canCreateSupplier && supplierSourceMode === 'EXTERNAL_ONLY' ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled
                title="This company uses external-only suppliers. Use the integration API or party lists sync from company settings."
              >
                New supplier
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Failed to load suppliers. Please try again.</AlertDescription>
        </Alert>
      ) : isFetching && suppliers.length === 0 ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {tableHeaders.map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableSkeleton rows={6} columns={7} />
              </tbody>
            </table>
          </div>
        </section>
      ) : filteredSuppliers.length === 0 ? (
        <section className="rounded-lg border border-border bg-card p-10 text-center shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Suppliers</p>
          <h2 className="mt-3 text-lg font-semibold text-foreground">
            {suppliers.length === 0 ? 'No suppliers yet' : 'No suppliers match these filters'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {suppliers.length === 0
              ? 'Create a supplier to start building your supplier master.'
              : 'Adjust the filters or search query to widen the results.'}
          </p>
          {suppliers.length === 0 && canCreateLocalSupplier ? (
            <div className="mt-5 flex justify-center gap-3">
              <Link href="/suppliers/new" className={buttonVariants({ size: 'sm' })}>
                Create supplier
              </Link>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {tableHeaders.map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="border-t border-border align-top transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">{supplier.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {supplier.email || supplier.phone || 'No email or phone'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        {supplier.source === 'PARTY_API_SYNC' ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] uppercase tracking-wide',
                              'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-200',
                            )}
                          >
                            Synced
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] uppercase tracking-wide',
                              'border-border bg-muted/40 text-muted-foreground',
                            )}
                          >
                            Local
                          </Badge>
                        )}
                        {!supplier.isActive ? (
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                            Inactive
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-mono text-xs text-foreground">{supplier.externalPartyId ?? 'Not linked'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">{supplier.contactPerson || 'Not set'}</p>
                        <p className="text-xs text-muted-foreground">
                          {supplier.phone || supplier.email || 'No direct contact'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">{supplier.tradeLicenseNumber || 'No trade license'}</p>
                        <p className="text-xs text-muted-foreground">TRN: {supplier.trnNumber || 'Not set'}</p>
                        <p className="text-xs text-muted-foreground">
                          License expiry: {formatDate(supplier.tradeLicenseExpiry)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">{supplier.city || 'No city'}</p>
                        <p className="text-xs text-muted-foreground">{supplier.address || 'No address'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/suppliers/${supplier.id}/edit`}
                          className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        >
                          Edit
                        </Link>
                        <Button type="button" variant="destructive" size="sm" onClick={() => openDeleteModal(supplier)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Modal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, supplier: null, check: null, loading: false })}
        title="Delete supplier"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {deleteModal.supplier ? (
              <>
                You are about to remove <span className="font-semibold text-foreground">{deleteModal.supplier.name}</span>.
              </>
            ) : (
              'You are about to remove this supplier.'
            )}
          </p>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              {deleteModal.loading ? 'Checking delete rules…' : deleteModalCopy(deleteModal.check)}
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={isDeleting}
              onClick={() => setDeleteModal({ open: false, supplier: null, check: null, loading: false })}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              onClick={confirmDelete}
              disabled={deleteModal.loading || deleteModal.check?.canDelete === false || isDeleting}
            >
              {isDeleting ? 'Please wait…' : deleteModal.check?.canDeactivate ? 'Deactivate' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
