import { LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { appApi } from '../appApi';

export const STOCK_BATCH_PAGE_SIZE_OPTIONS = LIST_PAGE_SIZE_OPTIONS;

export interface StockBatch {
  id: string;
  batchNumber: string;
  receiptNumber: string | null;
  materialId: string;
  materialName: string;
  materialUnit: string;
  warehouseId: string | null;
  warehouse: string | null;
  stockType: string | null;
  supplierId: string | null;
  supplierName: string | null;
  quantityReceived: number;
  quantityAvailable: number;
  quantityConsumed: number;
  unitCost: number;
  totalCost: number;
  receivedDate: string;
  expiryDate: string | null;
  notes: string | null;
  issueLinkCount: number;
  latestUsageDate: string | null;
}

export type StockBatchesListParams = {
  limit: number;
  offset: number;
  search?: string;
};

export type StockBatchesListResponse = {
  items: StockBatch[];
  total: number;
};

export const stockBatchesApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getStockBatches: builder.query<StockBatch[], void>({
      query: () => '/stock-batches',
      transformResponse: (r: { data: StockBatch[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'StockBatch', id: 'LIST' }, ...result.map((batch) => ({ type: 'StockBatch' as const, id: batch.id }))]
          : [{ type: 'StockBatch', id: 'LIST' }],
    }),

    getStockBatchesPage: builder.query<StockBatchesListResponse, StockBatchesListParams>({
      query: ({ limit, offset, search }) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        if (search?.trim()) params.set('search', search.trim());
        return `/stock-batches?${params.toString()}`;
      },
      transformResponse: (r: { data: StockBatchesListResponse }) => r.data,
      providesTags: (result) =>
        result
          ? [
              { type: 'StockBatch', id: 'LIST' },
              ...result.items.map((batch) => ({ type: 'StockBatch' as const, id: batch.id })),
            ]
          : [{ type: 'StockBatch', id: 'LIST' }],
    }),
  }),
});

export const { useGetStockBatchesQuery, useGetStockBatchesPageQuery } = stockBatchesApi;
