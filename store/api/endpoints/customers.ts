import { LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { appApi } from '../appApi';

export const CUSTOMER_PAGE_SIZE_OPTIONS = LIST_PAGE_SIZE_OPTIONS;

export type CustomerStatusFilter = 'all' | 'active' | 'inactive';

/** @deprecated Use CustomerStatusFilter — kept for page filter state typing */
export type CustomerFilter = CustomerStatusFilter;

export type CustomersListParams = {
  limit: number;
  offset: number;
  search?: string;
  status?: CustomerStatusFilter;
};

export type CustomersListResponse = {
  items: Customer[];
  total: number;
};

export type PartyRecordSource = 'LOCAL' | 'PARTY_API_SYNC';

export interface Customer {
  id: string;
  companyId: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
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

export type PartyListSyncResult = {
  ok: boolean;
  totalFromApi: number;
  created: number;
  updated: number;
};

export const customersApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getCustomers: builder.query<Customer[], void>({
      query: () => '/customers',
      transformResponse: (r: { data: Customer[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'Customer', id: 'LIST' }, ...result.map((c) => ({ type: 'Customer' as const, id: c.id }))]
          : [{ type: 'Customer', id: 'LIST' }],
    }),

    getCustomersPage: builder.query<CustomersListResponse, CustomersListParams>({
      query: ({ limit, offset, search, status }) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        if (search?.trim()) params.set('search', search.trim());
        if (status && status !== 'all') params.set('status', status);
        return `/customers?${params.toString()}`;
      },
      transformResponse: (r: { data: CustomersListResponse }) => r.data,
      providesTags: (result) =>
        result
          ? [
              { type: 'Customer', id: 'LIST' },
              ...result.items.map((c) => ({ type: 'Customer' as const, id: c.id })),
            ]
          : [{ type: 'Customer', id: 'LIST' }],
    }),

    getCustomersForExport: builder.query<Customer[], void>({
      query: () => '/customers',
      transformResponse: (r: { data: Customer[] }) => r.data,
    }),

    createCustomer: builder.mutation<Customer, Partial<Customer>>({
      query: (body) => ({
        url: '/customers',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Customer }) => r.data,
      invalidatesTags: [{ type: 'Customer', id: 'LIST' }],
    }),

    updateCustomer: builder.mutation<Customer, { id: string; data: Partial<Customer> }>({
      query: ({ id, data }) => ({
        url: `/customers/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: Customer }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Customer', id },
        { type: 'Customer', id: 'LIST' },
      ],
    }),

    deleteCustomer: builder.mutation<
      { deleted: boolean; permanent?: boolean; message?: string },
      string
    >({
      query: (id) => ({
        url: `/customers/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean; permanent?: boolean; message?: string } }) =>
        r.data,
      invalidatesTags: (result, error, id) => [
        { type: 'Customer', id },
        { type: 'Customer', id: 'LIST' },
      ],
    }),

    syncCustomersFromPartyApi: builder.mutation<PartyListSyncResult, void>({
      query: () => ({
        url: '/customers/sync',
        method: 'POST',
      }),
      transformResponse: (r: { data: PartyListSyncResult }) => r.data,
      invalidatesTags: [{ type: 'Customer', id: 'LIST' }],
    }),

    bulkImportCustomers: builder.mutation<
      { created: number; updated: number; skipped: number; warnings: string[] },
      { newRows: unknown[]; updateRows: unknown[] }
    >({
      query: (body) => ({
        url: '/customers/import/bulk',
        method: 'POST',
        body,
      }),
      transformResponse: (r: {
        data: { created: number; updated: number; skipped: number; warnings: string[] };
      }) => r.data,
      invalidatesTags: [{ type: 'Customer', id: 'LIST' }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetCustomersQuery,
  useGetCustomersPageQuery,
  useLazyGetCustomersForExportQuery,
  useGetCustomersForExportQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useSyncCustomersFromPartyApiMutation,
  useBulkImportCustomersMutation,
} = customersApi;
