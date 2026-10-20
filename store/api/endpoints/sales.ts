import { appApi } from '../appApi';

export type SalesStage = 'QUERY' | 'QUOTATION' | 'PURCHASE_ORDER';
export type SalesClosure = 'OPEN' | 'LOST' | 'CANCELLED' | 'REJECTED';
export type SalesQuotationMode = 'SINGLE' | 'MULTIPLE';

export type SalesLineField = { id: string; label: string; value: string; sortOrder: number };

export type SalesLine = {
  id: string;
  item: string;
  description: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  sortOrder: number;
  fields: SalesLineField[];
};

export type SalesRevision = {
  id: string;
  revision: number;
  quotationLabel: string;
  snapshot: {
    quotationMode: 'SINGLE' | 'MULTIPLE';
    startDate: string | null;
    options: Array<{
      name: string;
      vatAmount: number;
      lines: Array<{
        item: string;
        description: string | null;
        unitPrice: number;
        quantity: number;
        lineTotal: number;
        fields: Array<{ label: string; value: string }>;
      }>;
    }>;
  };
  createdAt: string;
};

export type SalesOption = {
  id: string;
  name: string;
  sortOrder: number;
  isAccepted: boolean;
  vatAmount: number;
  subtotal: number;
  gross: number;
  lines: SalesLine[];
};

export type SalesAttachment = {
  id: string;
  kind: 'CLIENT' | 'PO';
  fileName: string;
  mimeType: string;
  viewerUrl: string;
  createdAt: string;
};

export type SalesRecord = {
  id: string;
  queryNumber: string;
  quotationNumber: string;
  quotationRevision: number;
  customerId: string;
  customerName: string;
  displayCustomerName: string;
  projectLocation: string;
  projectDescription: string;
  projectScope: string;
  salesmanId: string;
  extraNotes: string | null;
  stage: SalesStage;
  closure: SalesClosure;
  closureReason: string | null;
  quotationIssuedAt: string | null;
  startDate: string | null;
  quotationMode: SalesQuotationMode;
  acceptedOptionId: string | null;
  poNumber: string | null;
  poDate: string | null;
  poValue: number | null;
  budgetDetails: string | null;
  purchaseOrderNotes: string | null;
  revisions: SalesRevision[];
  jobId: string | null;
  currencyCode: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    contactPerson: string | null;
    email: string | null;
    address: string | null;
    tradeLicenseNumber: string | null;
    tradeLicenseAuthority: string | null;
    tradeLicenseExpiry: string | null;
    trnNumber: string | null;
    trnExpiry: string | null;
  };
  salesman: { id: string; name: string; email: string; isActive: boolean };
  options: SalesOption[];
  attachments: SalesAttachment[];
  job: { id: string; jobNumber: string } | null;
  forwarded?: boolean;
};

export type SalesListItem = {
  id: string;
  queryNumber: string;
  quotationNumber: string;
  quotationRevision: number;
  stage: SalesStage;
  closure: SalesClosure;
  projectLocation: string;
  displayCustomerName: string;
  poNumber: string | null;
  grandTotal: number;
  currencyCode: string;
  updatedAt: string;
  salesman: { id: string; name: string };
  job: { id: string; jobNumber: string } | null;
};

export type SalesListResponse = {
  items: SalesListItem[];
  total: number;
  currencyCode: string;
};

export type SalesmanOption = { id: string; name: string; email: string };

export type SalesOptionInput = {
  name: string;
  vatAmount: number;
  lines: Array<{ item: string; description?: string | null; unitPrice: number; quantity: number }>;
};

const salesApi = appApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getSalesQueries: builder.query<
      SalesListResponse,
      { limit: number; offset: number; search?: string; stage?: SalesStage; closure?: SalesClosure; excludeClosure?: SalesClosure; withoutJob?: boolean }
    >({
      query: ({ limit, offset, search, stage, closure, excludeClosure, withoutJob }) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        if (search) params.set('search', search);
        if (stage) params.set('stage', stage);
        if (closure) params.set('closure', closure);
        if (excludeClosure) params.set('excludeClosure', excludeClosure);
        if (withoutJob) params.set('withoutJob', '1');
        return `/sales/queries?${params.toString()}`;
      },
      transformResponse: (response: { data: SalesListResponse }) => response.data,
      providesTags: ['SalesQuery'],
    }),
    getSalesQuery: builder.query<SalesRecord, string>({
      query: (id) => `/sales/queries/${id}`,
      transformResponse: (response: { data: SalesRecord }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'SalesQuery', id }],
    }),
    getSalesmen: builder.query<SalesmanOption[], void>({
      query: () => '/sales/salesmen',
      transformResponse: (response: { data: SalesmanOption[] }) => response.data,
    }),
    createSalesQuery: builder.mutation<SalesRecord, Record<string, unknown>>({
      query: (body) => ({ url: '/sales/queries', method: 'POST', body }),
      transformResponse: (response: { data: SalesRecord }) => response.data,
      invalidatesTags: ['SalesQuery', 'Customer'],
    }),
    updateSalesQuery: builder.mutation<SalesRecord, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/sales/queries/${id}`, method: 'PATCH', body }),
      transformResponse: (response: { data: SalesRecord }) => response.data,
      invalidatesTags: ['SalesQuery', 'Customer'],
    }),
    forwardSalesToQuotation: builder.mutation<SalesRecord, string>({
      query: (id) => ({ url: `/sales/queries/${id}/forward-quotation`, method: 'POST' }),
      transformResponse: (response: { data: SalesRecord }) => response.data,
      invalidatesTags: ['SalesQuery'],
    }),
    reviseSalesQuotation: builder.mutation<SalesRecord, string>({
      query: (id) => ({ url: `/sales/queries/${id}/revise`, method: 'POST' }),
      transformResponse: (response: { data: SalesRecord }) => response.data,
      invalidatesTags: ['SalesQuery'],
    }),
    receivePurchaseOrder: builder.mutation<SalesRecord, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/sales/queries/${id}/po-received`, method: 'POST', body }),
      transformResponse: (response: { data: SalesRecord }) => response.data,
      invalidatesTags: ['SalesQuery'],
    }),
    setSalesClosure: builder.mutation<SalesRecord, { id: string; closure: SalesClosure; reason?: string }>({
      query: ({ id, closure, reason }) => ({
        url: `/sales/queries/${id}/closure`,
        method: 'POST',
        body: { closure, reason },
      }),
      transformResponse: (response: { data: SalesRecord }) => response.data,
      invalidatesTags: ['SalesQuery'],
    }),
    createJobFromSales: builder.mutation<SalesRecord, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/sales/queries/${id}/create-job`, method: 'POST', body }),
      transformResponse: (response: { data: SalesRecord }) => response.data,
      invalidatesTags: ['SalesQuery', 'Job'],
    }),
  }),
});

export const {
  useGetSalesQueriesQuery,
  useGetSalesQueryQuery,
  useGetSalesmenQuery,
  useCreateSalesQueryMutation,
  useUpdateSalesQueryMutation,
  useForwardSalesToQuotationMutation,
  useReviseSalesQuotationMutation,
  useReceivePurchaseOrderMutation,
  useSetSalesClosureMutation,
  useCreateJobFromSalesMutation,
} = salesApi;
