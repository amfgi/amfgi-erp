import { LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { appApi } from '../appApi';

import type { PartyListSyncResult, PartyRecordSource } from './customers';

export const SUPPLIER_PAGE_SIZE_OPTIONS = LIST_PAGE_SIZE_OPTIONS;

export type SupplierSourceFilter = 'all' | 'local' | 'synced';

export type SuppliersListParams = {
  limit: number;
  offset: number;
  search?: string;
  source?: SupplierSourceFilter;
};

export type SuppliersListResponse = {
  items: Supplier[];
  total: number;
};

export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  isActive: boolean;
  source?: PartyRecordSource;
  externalPartyId?: number | null;
  externalSyncedAt?: string | Date | null;
  tradeLicenseNumber?: string | null;
  tradeLicenseAuthority?: string | null;
  tradeLicenseExpiry?: string | Date | null;
  trnNumber?: string | null;
  trnExpiry?: string | Date | null;
  contactsJson?: unknown;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export const suppliersApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getSuppliers: builder.query<Supplier[], void>({
      query: () => '/suppliers',
      transformResponse: (r: { data: Supplier[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'Supplier', id: 'LIST' }, ...result.map((s) => ({ type: 'Supplier' as const, id: s.id }))]
          : [{ type: 'Supplier', id: 'LIST' }],
    }),

    getSuppliersPage: builder.query<SuppliersListResponse, SuppliersListParams>({
      query: ({ limit, offset, search, source }) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        if (search?.trim()) params.set('search', search.trim());
        if (source && source !== 'all') params.set('source', source);
        return `/suppliers?${params.toString()}`;
      },
      transformResponse: (r: { data: SuppliersListResponse }) => r.data,
      providesTags: (result) =>
        result
          ? [
              { type: 'Supplier', id: 'LIST' },
              ...result.items.map((s) => ({ type: 'Supplier' as const, id: s.id })),
            ]
          : [{ type: 'Supplier', id: 'LIST' }],
    }),

    getSupplierById: builder.query<Supplier, string>({
      query: (id) => `/suppliers/${id}`,
      transformResponse: (r: { data: Supplier }) => r.data,
      providesTags: (result, error, id) => [{ type: 'Supplier', id }],
    }),

    createSupplier: builder.mutation<Supplier, Partial<Supplier>>({
      query: (body) => ({
        url: '/suppliers',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Supplier }) => r.data,
      invalidatesTags: [{ type: 'Supplier', id: 'LIST' }],
    }),

    updateSupplier: builder.mutation<Supplier, { id: string; data: Partial<Supplier> }>({
      query: ({ id, data }) => ({
        url: `/suppliers/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: Supplier }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
      ],
    }),

    deleteSupplier: builder.mutation<
      { deleted: boolean; permanent?: boolean; message?: string },
      string
    >({
      query: (id) => ({
        url: `/suppliers/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean; permanent?: boolean; message?: string } }) =>
        r.data,
      invalidatesTags: (result, error, id) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
      ],
    }),

    syncSuppliersFromPartyApi: builder.mutation<PartyListSyncResult, void>({
      query: () => ({
        url: '/suppliers/sync',
        method: 'POST',
      }),
      transformResponse: (r: { data: PartyListSyncResult }) => r.data,
      invalidatesTags: [{ type: 'Supplier', id: 'LIST' }],
    }),

    bulkImportSuppliers: builder.mutation<
      { created: number; updated: number; skipped: number; warnings: string[] },
      { newRows: unknown[]; updateRows: unknown[] }
    >({
      query: (body) => ({
        url: '/suppliers/import/bulk',
        method: 'POST',
        body,
      }),
      transformResponse: (r: {
        data: { created: number; updated: number; skipped: number; warnings: string[] };
      }) => r.data,
      invalidatesTags: [{ type: 'Supplier', id: 'LIST' }],
    }),

    getSuppliersForExport: builder.query<Supplier[], void>({
      query: () => '/suppliers?includeInactive=true',
      transformResponse: (r: { data: Supplier[] }) => r.data,
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetSuppliersQuery,
  useGetSuppliersPageQuery,
  useLazyGetSuppliersPageQuery,
  useGetSupplierByIdQuery,
  useLazyGetSupplierByIdQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useDeleteSupplierMutation,
  useSyncSuppliersFromPartyApiMutation,
  useBulkImportSuppliersMutation,
  useLazyGetSuppliersForExportQuery,
  useGetSuppliersForExportQuery,
} = suppliersApi;
