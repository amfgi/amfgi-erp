import { adminApi } from '../adminApi';

export interface Company {
  id: string;
  name: string;
  slug: string;
  description?: string;
  externalCompanyId?: string | null;
  isActive: boolean;
  warehouseMode?: 'REQUIRED';
  stockFallbackWarehouseId?: string | null;
  stockFallbackWarehouse?: {
    id: string;
    name: string;
  } | null;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export const companiesApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getCompanies: builder.query<Company[], void>({
      query: () => '/companies',
      transformResponse: (r: { data: Company[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'Company', id: 'LIST' }, ...result.map((company) => ({ type: 'Company' as const, id: company.id }))]
          : [{ type: 'Company', id: 'LIST' }],
    }),

    createCompany: builder.mutation<Company, Partial<Company>>({
      query: (body) => ({
        url: '/companies',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Company }) => r.data,
      invalidatesTags: [],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data: created } = await queryFulfilled;
          dispatch(
            adminApi.util.updateQueryData('getCompanies', undefined, (draft) => {
              if (!draft.some((c) => c.id === created.id)) draft.unshift(created);
            }),
          );
        } catch {
          /* no-op */
        }
      },
    }),

    updateCompany: builder.mutation<Company, { id: string; data: Partial<Company> }>({
      query: ({ id, data }) => ({
        url: `/companies/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: Company }) => r.data,
      invalidatesTags: [],
      async onQueryStarted({ id, data }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          adminApi.util.updateQueryData('getCompanies', undefined, (draft) => {
            const row = draft.find((c) => c.id === id);
            if (!row) return;
            if (data.name !== undefined) row.name = data.name;
            if (data.description !== undefined) row.description = data.description;
            if (data.externalCompanyId !== undefined) row.externalCompanyId = data.externalCompanyId;
            if (data.isActive !== undefined) row.isActive = data.isActive;
            if (data.slug !== undefined) row.slug = data.slug;
            if (data.warehouseMode !== undefined) row.warehouseMode = data.warehouseMode;
            if (data.stockFallbackWarehouseId !== undefined) {
              row.stockFallbackWarehouseId = data.stockFallbackWarehouseId;
            }
          }),
        );
        try {
          const { data: server } = await queryFulfilled;
          dispatch(
            adminApi.util.updateQueryData('getCompanies', undefined, (draft) => {
              const idx = draft.findIndex((c) => c.id === id);
              if (idx !== -1) draft[idx] = server;
            }),
          );
        } catch {
          patch.undo();
        }
      },
    }),
  }),
});

export const { useGetCompaniesQuery, useCreateCompanyMutation, useUpdateCompanyMutation } =
  companiesApi;
