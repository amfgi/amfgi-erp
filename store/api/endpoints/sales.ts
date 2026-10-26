import { appApi } from '../appApi';
import type { QuotationDocument } from '@/lib/sales/quotationDocument';

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
    quotationDocument?: QuotationDocument | null;
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
  assignedTo: { id: string; name: string; email: string } | null;
  options: SalesOption[];
  attachments: SalesAttachment[];
  job: { id: string; jobNumber: string } | null;
  quotationDocument: QuotationDocument | null;
  company: { letterheadUrl: string | null; name: string } | null;
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
  assignedTo: { id: string; name: string } | null;
  job: { id: string; jobNumber: string } | null;
};

export type SalesListResponse = {
  items: SalesListItem[];
  total: number;
  currencyCode: string;
};

export type SalesmanOption = { id: string; name: string; email: string };

export type SalesWorkLogEntry = {
  id: string;
  action: string;
  label: string;
  detail: string | null;
  createdAt: string;
  actor: { id: string; name: string };
};

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
    forwardSalesToQuotation: builder.mutation<SalesRecord, { id: string; assigneeId: string }>({
      query: ({ id, assigneeId }) => ({
        url: `/sales/queries/${id}/forward-quotation`,
        method: 'POST',
        body: { assigneeId },
      }),
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
    getQuotationTermsTemplates: builder.query<Array<{ id: string; name: string; rows: Array<{ label: string; value: string }> }>, void>({
      query: () => '/sales/terms-templates',
      transformResponse: (response: { data: Array<{ id: string; name: string; rows: Array<{ label: string; value: string }> }> }) => response.data,
      providesTags: ['QuotationTermsTemplate'],
    }),
    createQuotationTermsTemplate: builder.mutation<{ id: string; name: string }, { name: string; rows: Array<{ label: string; value: string }> }>({
      query: (body) => ({ url: '/sales/terms-templates', method: 'POST', body }),
      transformResponse: (response: { data: { id: string; name: string } }) => response.data,
      invalidatesTags: ['QuotationTermsTemplate'],
    }),
    updateQuotationTermsTemplate: builder.mutation<{ id: string; name: string }, { id: string; name: string }>({
      query: ({ id, name }) => ({ url: `/sales/terms-templates/${id}`, method: 'PATCH', body: { name } }),
      transformResponse: (response: { data: { id: string; name: string } }) => response.data,
      invalidatesTags: ['QuotationTermsTemplate'],
    }),
    deleteQuotationTermsTemplate: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/sales/terms-templates/${id}`, method: 'DELETE' }),
      transformResponse: (response: { data: { id: string } }) => response.data,
      invalidatesTags: ['QuotationTermsTemplate'],
    }),
    getQuotationCustomSections: builder.query<Array<{ id: string; name: string; content: { name: string; body: string; minHeightMm: number; widthPercent: number } }>, void>({
      query: () => '/sales/custom-sections',
      transformResponse: (response: { data: Array<{ id: string; name: string; content: { name: string; body: string; minHeightMm: number; widthPercent: number } }> }) => response.data,
      providesTags: ['QuotationCustomSection'],
    }),
    createQuotationCustomSection: builder.mutation<{ id: string; name: string }, { name: string; content: { name: string; body: string; minHeightMm: number; widthPercent: number } }>({
      query: (body) => ({ url: '/sales/custom-sections', method: 'POST', body }),
      transformResponse: (response: { data: { id: string; name: string } }) => response.data,
      invalidatesTags: ['QuotationCustomSection'],
    }),
    updateQuotationCustomSection: builder.mutation<{ id: string; name: string }, { id: string; name: string }>({
      query: ({ id, name }) => ({ url: `/sales/custom-sections/${id}`, method: 'PATCH', body: { name } }),
      transformResponse: (response: { data: { id: string; name: string } }) => response.data,
      invalidatesTags: ['QuotationCustomSection'],
    }),
    deleteQuotationCustomSection: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/sales/custom-sections/${id}`, method: 'DELETE' }),
      transformResponse: (response: { data: { id: string } }) => response.data,
      invalidatesTags: ['QuotationCustomSection'],
    }),
    getSalesWorkLog: builder.query<SalesWorkLogEntry[], string>({
      query: (id) => `/sales/queries/${id}/work-log`,
      transformResponse: (response: { data: SalesWorkLogEntry[] }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'SalesQuery', id }],
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
  useGetQuotationTermsTemplatesQuery,
  useCreateQuotationTermsTemplateMutation,
  useUpdateQuotationTermsTemplateMutation,
  useDeleteQuotationTermsTemplateMutation,
  useGetQuotationCustomSectionsQuery,
  useCreateQuotationCustomSectionMutation,
  useUpdateQuotationCustomSectionMutation,
  useDeleteQuotationCustomSectionMutation,
} = salesApi;

export const useGetSalesWorkLogQuery = salesApi.endpoints.getSalesWorkLog.useQuery;
