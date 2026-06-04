'use client';

import { useCallback } from 'react';
import { useStore } from 'react-redux';
import { materialsApi } from '@/store/api/endpoints/materials';
import { suppliersApi } from '@/store/api/endpoints/suppliers';
import {
  useLazyGetMaterialByIdQuery,
  useLazyGetMaterialsPageQuery,
  useLazyGetSupplierByIdQuery,
  useLazyGetSuppliersPageQuery,
  type Material,
  type Supplier,
} from '@/store/hooks';
import type { RootState } from '@/store/store';

export const PAGED_SELECT_LIMIT = 50;

export type MaterialSelectItem = {
  id: string;
  label: string;
  searchText: string;
  material: Material;
};

export type SupplierSelectItem = {
  id: string;
  label: string;
  searchText?: string;
  supplier: Supplier;
};

const inflightRequests = new Map<string, Promise<unknown>>();

function dedupeRequest<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) return existing as Promise<T>;
  const promise = run().finally(() => {
    if (inflightRequests.get(key) === promise) {
      inflightRequests.delete(key);
    }
  });
  inflightRequests.set(key, promise);
  return promise;
}

function normalizeSearchQuery(query: string) {
  return query.trim();
}

export function toMaterialSelectItem(material: Material): MaterialSelectItem {
  return {
    id: material.id,
    label: material.name,
    searchText: `${material.currentStock} ${material.unit}`,
    material,
  };
}

export function toSupplierSelectItem(supplier: Supplier): SupplierSelectItem {
  return {
    id: supplier.id,
    label: supplier.name,
    searchText: supplier.contactPerson || supplier.email || supplier.phone,
    supplier,
  };
}

/**
 * Server-paged material search backed by RTK Query (`getMaterialsPage` / `getMaterialById`).
 * Uses RTK cache (`preferCacheValue`) plus in-flight dedupe for identical concurrent calls.
 */
export function usePagedMaterialSearch() {
  const store = useStore<RootState>();
  const [fetchMaterialsPage] = useLazyGetMaterialsPageQuery();
  const [fetchMaterialById] = useLazyGetMaterialByIdQuery();

  const readCachedMaterial = useCallback(
    (id: string) => {
      const entry = materialsApi.endpoints.getMaterialById.select(id)(store.getState());
      return entry.data ? toMaterialSelectItem(entry.data) : null;
    },
    [store]
  );

  const search = useCallback(
    async (query: string): Promise<MaterialSelectItem[]> => {
      const normalized = normalizeSearchQuery(query);
      if (!normalized) return [];

      return dedupeRequest(`materials-page:${normalized}`, async () => {
        const { items } = await fetchMaterialsPage(
          { limit: PAGED_SELECT_LIMIT, offset: 0, search: normalized },
          true
        ).unwrap();
        return items.filter((material) => material.isActive).map(toMaterialSelectItem);
      });
    },
    [fetchMaterialsPage]
  );

  const resolveById = useCallback(
    async (id: string): Promise<MaterialSelectItem | null> => {
      const trimmed = id.trim();
      if (!trimmed) return null;

      const cached = readCachedMaterial(trimmed);
      if (cached) return cached;

      return dedupeRequest(`material-by-id:${trimmed}`, async () => {
        try {
          const material = await fetchMaterialById(trimmed, true).unwrap();
          return toMaterialSelectItem(material);
        } catch {
          return null;
        }
      });
    },
    [fetchMaterialById, readCachedMaterial]
  );

  return { search, resolveById };
}

/**
 * Server-paged supplier search backed by RTK Query (`getSuppliersPage` / `getSupplierById`).
 */
export function usePagedSupplierSearch() {
  const store = useStore<RootState>();
  const [fetchSuppliersPage] = useLazyGetSuppliersPageQuery();
  const [fetchSupplierById] = useLazyGetSupplierByIdQuery();

  const readCachedSupplier = useCallback(
    (id: string) => {
      const entry = suppliersApi.endpoints.getSupplierById.select(id)(store.getState());
      return entry.data ? toSupplierSelectItem(entry.data) : null;
    },
    [store]
  );

  const search = useCallback(
    async (query: string): Promise<SupplierSelectItem[]> => {
      const normalized = normalizeSearchQuery(query);
      if (!normalized) return [];

      return dedupeRequest(`suppliers-page:${normalized}`, async () => {
        const { items } = await fetchSuppliersPage(
          { limit: PAGED_SELECT_LIMIT, offset: 0, search: normalized },
          true
        ).unwrap();
        return items.filter((supplier) => supplier.isActive).map(toSupplierSelectItem);
      });
    },
    [fetchSuppliersPage]
  );

  const resolveById = useCallback(
    async (id: string): Promise<SupplierSelectItem | null> => {
      const trimmed = id.trim();
      if (!trimmed) return null;

      const cached = readCachedSupplier(trimmed);
      if (cached) return cached;

      return dedupeRequest(`supplier-by-id:${trimmed}`, async () => {
        try {
          const supplier = await fetchSupplierById(trimmed, true).unwrap();
          return toSupplierSelectItem(supplier);
        } catch {
          return null;
        }
      });
    },
    [fetchSupplierById, readCachedSupplier]
  );

  const resolveByName = useCallback(
    async (name: string): Promise<SupplierSelectItem | null> => {
      const normalized = normalizeSearchQuery(name);
      if (!normalized) return null;

      return dedupeRequest(`suppliers-page:${normalized}`, async () => {
        const { items } = await fetchSuppliersPage(
          { limit: PAGED_SELECT_LIMIT, offset: 0, search: normalized },
          true
        ).unwrap();
        const exact = items.find((supplier) => supplier.name === normalized);
        const pick = exact ?? items[0];
        return pick ? toSupplierSelectItem(pick) : null;
      });
    },
    [fetchSuppliersPage]
  );

  return { search, resolveById, resolveByName };
}
