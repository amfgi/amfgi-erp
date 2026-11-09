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

export type QuotationDocumentFile = {
  id: string;
  typeId: string;
  typeName: string;
  fileName: string;
  mimeType: string;
  viewerUrl: string;
  note: string | null;
  carriedToPurchaseOrder: boolean;
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
    deleteSalesQuery: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/sales/queries/${id}`, method: 'DELETE' }),
      transformResponse: (response: { data: { id: string } }) => response.data,
      invalidatesTags: ['SalesQuery'],
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
    reviseSalesQuotation: builder.mutation<
      SalesRecord,
      { id: string; fromRevisionId?: string; quotationDocument?: QuotationDocument; startDate?: string | null }
    >({
      query: ({ id, fromRevisionId, quotationDocument, startDate }) => ({
        url: `/sales/queries/${id}/revise`,
        method: 'POST',
        body: {
          ...(fromRevisionId ? { fromRevisionId } : {}),
          ...(quotationDocument ? { quotationDocument } : {}),
          ...(startDate !== undefined ? { startDate } : {}),
        },
      }),
      transformResponse: (response: { data: SalesRecord }) => response.data,
      invalidatesTags: ['SalesQuery'],
    }),
    checkQuotationSerial: builder.query<{ number: string; available: boolean }, { id: string; serial: string }>({
      query: ({ id, serial }) => `/sales/queries/${id}/quotation-number?serial=${encodeURIComponent(serial)}`,
      transformResponse: (response: { data: { number: string; available: boolean } }) => response.data,
    }),
    changeQuotationSerial: builder.mutation<SalesRecord, { id: string; serial: string }>({
      query: ({ id, serial }) => ({
        url: `/sales/queries/${id}/quotation-number`,
        method: 'POST',
        body: { serial },
      }),
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
    getQuotationCustomSections: builder.query<Array<{ id: string; name: string; content: CustomSectionRecord }>, void>({
      query: () => '/sales/custom-sections',
      transformResponse: (response: { data: Array<{ id: string; name: string; content: CustomSectionRecord }> }) => response.data,
      providesTags: ['QuotationCustomSection'],
    }),
    createQuotationCustomSection: builder.mutation<{ id: string; name: string }, { name: string; content: CustomSectionBody }>({
      query: (body) => ({ url: '/sales/custom-sections', method: 'POST', body }),
      transformResponse: (response: { data: { id: string; name: string } }) => response.data,
      invalidatesTags: ['QuotationCustomSection'],
    }),
    updateQuotationCustomSection: builder.mutation<{ id: string; name: string }, { id: string; name: string; content?: CustomSectionBody }>({
      query: ({ id, name, content }) => ({ url: `/sales/custom-sections/${id}`, method: 'PATCH', body: content ? { name, content } : { name } }),
      transformResponse: (response: { data: { id: string; name: string } }) => response.data,
      invalidatesTags: ['QuotationCustomSection'],
    }),
    deleteQuotationCustomSection: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/sales/custom-sections/${id}`, method: 'DELETE' }),
      transformResponse: (response: { data: { id: string } }) => response.data,
      invalidatesTags: ['QuotationCustomSection'],
    }),
    createQuotationCustomSectionVersion: builder.mutation<{ id: string; name: string }, { id: string; name: string; content: CustomSectionBody }>({
      query: ({ id, name, content }) => ({ url: `/sales/custom-sections/${id}/versions`, method: 'POST', body: { name, content } }),
      transformResponse: (response: { data: { id: string; name: string } }) => response.data,
      invalidatesTags: ['QuotationCustomSection'],
    }),
    updateQuotationCustomSectionVersion: builder.mutation<{ id: string; name: string }, { id: string; versionId: string; name: string; content?: CustomSectionBody }>({
      query: ({ id, versionId, name, content }) => ({ url: `/sales/custom-sections/${id}/versions`, method: 'PATCH', body: content ? { versionId, name, content } : { versionId, name } }),
      transformResponse: (response: { data: { id: string; name: string } }) => response.data,
      invalidatesTags: ['QuotationCustomSection'],
    }),
    deleteQuotationCustomSectionVersion: builder.mutation<{ id: string }, { id: string; versionId: string }>({
      query: ({ id, versionId }) => ({ url: `/sales/custom-sections/${id}/versions?versionId=${encodeURIComponent(versionId)}`, method: 'DELETE' }),
      transformResponse: (response: { data: { id: string } }) => response.data,
      invalidatesTags: ['QuotationCustomSection'],
    }),
    getQuotationSectionPresets: builder.query<SectionPreset[], SectionPresetKind>({
      query: (kind) => `/sales/section-presets?kind=${kind}`,
      transformResponse: (response: { data: SectionPreset[] }) => response.data,
      providesTags: (_result, _error, kind) => [{ type: 'QuotationSectionPreset', id: kind }],
    }),
    createQuotationSectionPreset: builder.mutation<
      { id: string; name: string },
      { kind: 'scope'; name: string; body: string } | { kind: 'specification'; name: string; rows: Array<{ label: string; value: string }> }
    >({
      query: (body) => ({ url: '/sales/section-presets', method: 'POST', body }),
      transformResponse: (response: { data: { id: string; name: string } }) => response.data,
      invalidatesTags: (_result, _error, arg) => [{ type: 'QuotationSectionPreset', id: arg.kind }],
    }),
    updateQuotationSectionPreset: builder.mutation<{ id: string; name: string }, { id: string; kind: SectionPresetKind; name: string }>({
      query: ({ id, name }) => ({ url: `/sales/section-presets/${id}`, method: 'PATCH', body: { name } }),
      transformResponse: (response: { data: { id: string; name: string } }) => response.data,
      invalidatesTags: (_result, _error, arg) => [{ type: 'QuotationSectionPreset', id: arg.kind }],
    }),
    deleteQuotationSectionPreset: builder.mutation<{ id: string }, { id: string; kind: SectionPresetKind }>({
      query: ({ id }) => ({ url: `/sales/section-presets/${id}`, method: 'DELETE' }),
      transformResponse: (response: { data: { id: string } }) => response.data,
      invalidatesTags: (_result, _error, arg) => [{ type: 'QuotationSectionPreset', id: arg.kind }],
    }),
    getQuotationTemplates: builder.query<Array<{ id: string; name: string; key: string }>, void>({
      query: () => '/sales/quotation-templates',
      transformResponse: (response: { data: Array<{ id: string; name: string; key: string }> }) => response.data,
      providesTags: ['QuotationTemplate'],
    }),
    getQuotationTemplate: builder.query<{ id: string; name: string; document: QuotationDocument }, string>({
      query: (id) => `/sales/quotation-templates/${id}`,
      transformResponse: (response: { data: { id: string; name: string; document: QuotationDocument } }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'QuotationTemplate', id }],
    }),
    createQuotationTemplate: builder.mutation<{ id: string; name: string }, { name: string; document: QuotationDocument }>({
      query: (body) => ({ url: '/sales/quotation-templates', method: 'POST', body }),
      transformResponse: (response: { data: { id: string; name: string } }) => response.data,
      invalidatesTags: ['QuotationTemplate'],
    }),
    getQuotationDocuments: builder.query<
      { types: Array<{ id: string; name: string }>; documents: QuotationDocumentFile[] },
      string
    >({
      query: (id) => `/sales/queries/${id}/documents`,
      transformResponse: (response: { data: { types: Array<{ id: string; name: string }>; documents: QuotationDocumentFile[] } }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'QuotationDocument', id }],
    }),
    createQuotationDocumentType: builder.mutation<{ id: string; name: string }, { id: string; name: string }>({
      query: ({ id, name }) => ({ url: `/sales/queries/${id}/document-types`, method: 'POST', body: { name } }),
      transformResponse: (response: { data: { id: string; name: string } }) => response.data,
      invalidatesTags: (_result, _error, arg) => [{ type: 'QuotationDocument', id: arg.id }],
    }),
    removeQuotationDocumentType: builder.mutation<{ id: string }, { id: string; typeId: string }>({
      query: ({ id, typeId }) => ({ url: `/sales/queries/${id}/document-types/${typeId}`, method: 'DELETE' }),
      transformResponse: (response: { data: { id: string } }) => response.data,
      invalidatesTags: ['QuotationDocument'],
    }),
    addQuotationDocument: builder.mutation<QuotationDocumentFile, { id: string; body: FormData }>({
      query: ({ id, body }) => ({ url: `/sales/queries/${id}/documents`, method: 'POST', body }),
      transformResponse: (response: { data: QuotationDocumentFile }) => response.data,
      invalidatesTags: (_result, _error, arg) => [{ type: 'QuotationDocument', id: arg.id }, { type: 'SalesQuery', id: arg.id }],
    }),
    updateQuotationDocumentNote: builder.mutation<QuotationDocumentFile, { id: string; salesQueryId: string; note: string }>({
      query: ({ id, note }) => ({ url: `/sales/documents/${id}`, method: 'PATCH', body: { note } }),
      transformResponse: (response: { data: QuotationDocumentFile }) => response.data,
      invalidatesTags: (_result, _error, arg) => [{ type: 'QuotationDocument', id: arg.salesQueryId }, { type: 'SalesQuery', id: arg.salesQueryId }],
    }),
    removeQuotationDocument: builder.mutation<{ id: string }, { id: string; salesQueryId: string }>({
      query: ({ id }) => ({ url: `/sales/documents/${id}`, method: 'DELETE' }),
      transformResponse: (response: { data: { id: string } }) => response.data,
      invalidatesTags: (_result, _error, arg) => [{ type: 'QuotationDocument', id: arg.salesQueryId }, { type: 'SalesQuery', id: arg.salesQueryId }],
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
  useDeleteSalesQueryMutation,
  useUpdateSalesQueryMutation,
  useForwardSalesToQuotationMutation,
  useReviseSalesQuotationMutation,
  useCheckQuotationSerialQuery,
  useChangeQuotationSerialMutation,
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
  useCreateQuotationCustomSectionVersionMutation,
  useUpdateQuotationCustomSectionVersionMutation,
  useDeleteQuotationCustomSectionVersionMutation,
  useGetQuotationSectionPresetsQuery,
  useCreateQuotationSectionPresetMutation,
  useUpdateQuotationSectionPresetMutation,
  useDeleteQuotationSectionPresetMutation,
  useGetQuotationTemplatesQuery,
  useGetQuotationTemplateQuery,
  useLazyGetQuotationTemplateQuery,
  useCreateQuotationTemplateMutation,
} = salesApi;

export type CustomSectionBody = {
  name: string;
  body: string;
  minHeightMm: number;
  widthPercent: number;
};

export type CustomSectionRecord = CustomSectionBody & {
  versions: Array<{ id: string; name: string; content: CustomSectionBody }>;
};

export type SectionPresetKind = 'scope' | 'specification';

export type SectionPreset =
  | { id: string; name: string; kind: 'scope'; body: string }
  | { id: string; name: string; kind: 'specification'; rows: Array<{ label: string; value: string }> };

export const useGetSalesWorkLogQuery = salesApi.endpoints.getSalesWorkLog.useQuery;
export const useGetQuotationDocumentsQuery = salesApi.endpoints.getQuotationDocuments.useQuery;
export const useCreateQuotationDocumentTypeMutation = salesApi.endpoints.createQuotationDocumentType.useMutation;
export const useRemoveQuotationDocumentTypeMutation = salesApi.endpoints.removeQuotationDocumentType.useMutation;
export const useAddQuotationDocumentMutation = salesApi.endpoints.addQuotationDocument.useMutation;
export const useUpdateQuotationDocumentNoteMutation = salesApi.endpoints.updateQuotationDocumentNote.useMutation;
export const useRemoveQuotationDocumentMutation = salesApi.endpoints.removeQuotationDocument.useMutation;
