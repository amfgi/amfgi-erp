import { appApi } from '../appApi';

export interface FactoryProductionLine {
  id: string;
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
}

export interface FactoryProductionEntry {
  id: string;
  productionDate: string;
  warehouseId: string;
  warehouseName: string;
  notes: string | null;
  createdByName: string;
  createdAt: string;
  lines: FactoryProductionLine[];
}

export interface FactoryProductionInput {
  productionDate: string;
  warehouseId: string;
  notes?: string | null;
  lines: Array<{ materialId: string; quantity: number }>;
}

export const factoryProductionApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getFactoryProductions: builder.query<FactoryProductionEntry[], void>({
      query: () => '/stock/factory-production',
      transformResponse: (r: { data: FactoryProductionEntry[] }) => r.data,
      providesTags: [{ type: 'FactoryProduction', id: 'LIST' }],
    }),
    postFactoryProduction: builder.mutation<FactoryProductionEntry, FactoryProductionInput>({
      query: (body) => ({
        url: '/stock/factory-production',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: FactoryProductionEntry }) => r.data,
      invalidatesTags: [
        { type: 'FactoryProduction', id: 'LIST' },
        { type: 'Material', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'Transaction', id: 'LIST' },
        { type: 'StockValuation', id: 'LIST' },
      ],
    }),
  }),
});

export const { useGetFactoryProductionsQuery, usePostFactoryProductionMutation } = factoryProductionApi;
