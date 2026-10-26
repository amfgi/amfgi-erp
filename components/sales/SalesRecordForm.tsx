'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/shadcn/button';
import SearchSelect from '@/components/ui/SearchSelect';
import Modal from '@/components/ui/Modal';
import { acceptedOptionId, QuotationSheet } from '@/components/sales/QuotationSheet';
import { salesAccess } from '@/lib/sales/access';
import { dateInputValue } from '@/lib/sales/format';
import { downloadQuotationPdf } from '@/lib/sales/downloadQuotationPdf';
import { documentFromRecord, optionBlocks, plainText, quotationFileName, readQuotationDocument, type QuotationDocument } from '@/lib/sales/quotationDocument';
import {
  useCreateJobFromSalesMutation,
  useCreateSalesQueryMutation,
  useReceivePurchaseOrderMutation,
  useForwardSalesToQuotationMutation,
  useGetCustomersQuery,
  useGetSalesmenQuery,
  useGetSalesQueryQuery,
  useGetSalesWorkLogQuery,
  useReviseSalesQuotationMutation,
  useSetSalesClosureMutation,
  useUpdateSalesQueryMutation,
  type Customer,
} from '@/store/hooks';
import type { SalesAttachment, SalesRevision } from '@/store/api/endpoints/sales';

const INPUT_CLASS =
  'mt-1.5 w-full rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60';
const LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

function SalesWorkLogDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const workLogQuery = useGetSalesWorkLogQuery(id);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Working log"
      description="Newest first. Older records stay empty until someone works on them."
      actions={
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      {workLogQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : workLogQuery.isError ? (
        <p className="text-sm text-muted-foreground">The working log could not be loaded.</p>
      ) : (workLogQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No work has been recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {(workLogQuery.data ?? []).map((entry) => (
            <li key={entry.id} className="border-b border-border pb-3 text-sm last:border-0">
              <p className="font-medium text-foreground">{entry.label}</p>
              <p className="text-muted-foreground">
                {entry.actor.name} · {new Date(entry.createdAt).toLocaleString()}
              </p>
              {entry.detail ? <p className="text-muted-foreground">{entry.detail}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function fileCountLabel(count: number) {
  if (count === 0) return 'No files';
  if (count === 1) return '1 file';
  return `${count} files`;
}

function AttachmentFiles({ files, pending = [] }: { files: SalesAttachment[]; pending?: string[] }) {
  const count = files.length + pending.length;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{fileCountLabel(count)}</p>
      {files.map((file) => (
        <div key={file.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <span className="min-w-0 truncate text-sm">{file.fileName}</span>
          <a
            href={`/api/sales/attachments/${file.id}/download`}
            download={file.fileName}
            aria-label={`Download ${file.fileName}`}
            title="Download"
            className="inline-flex shrink-0 cursor-pointer items-center text-primary"
          >
            <Download className="size-4" />
          </a>
        </div>
      ))}
      {pending.map((name, index) => (
        <div key={`${name}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border px-3 py-2">
          <span className="min-w-0 truncate text-sm">{name}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">Not saved</span>
        </div>
      ))}
    </div>
  );
}

function apiError(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { error?: string } }).data;
    if (data?.error) return data.error;
  }
  return 'Something went wrong';
}

function Section({
  eyebrow,
  title,
  description,
  children,
  allowSticky = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  allowSticky?: boolean;
}) {
  return (
    <section className={`${allowSticky ? 'overflow-visible' : 'overflow-hidden'} rounded-lg border border-border bg-card shadow-sm`}>
      <div className="border-b border-border bg-muted/30 px-4 py-4 sm:px-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

export default function SalesRecordForm({ section }: { section: 'query' | 'quotation' | 'purchaseOrder' }) {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id');
  const { data: session } = useSession();
  const access = salesAccess({
    isSuperAdmin: session?.user?.isSuperAdmin,
    permissions: session?.user?.permissions,
  });
  const recordQuery = useGetSalesQueryQuery(id ?? '', { skip: !id });
  const record = recordQuery.data;
  const customersQuery = useGetCustomersQuery();
  const salesmenQuery = useGetSalesmenQuery();
  const [createQuery, createState] = useCreateSalesQueryMutation();
  const [updateQuery, updateState] = useUpdateSalesQueryMutation();
  const [forwardQuotation, forwardQuotationState] = useForwardSalesToQuotationMutation();
  const [revise, reviseState] = useReviseSalesQuotationMutation();
  const [receivePurchaseOrder, receivePurchaseOrderState] = useReceivePurchaseOrderMutation();
  const [setClosure, closureState] = useSetSalesClosureMutation();
  const [createJob, createJobState] = useCreateJobFromSalesMutation();

  const [queryNumber, setQueryNumber] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectScope, setProjectScope] = useState('');
  const [salesmanId, setSalesmanId] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [startDate, setStartDate] = useState('');
  const [acceptedIndex, setAcceptedIndex] = useState<number | null>(null);
  const acceptedForRecord = useRef<string | null>(null);
  const [poDate, setPoDate] = useState('');
  const [poValue, setPoValue] = useState('');
  const [budgetDetails, setBudgetDetails] = useState('');
  const [purchaseOrderNotes, setPurchaseOrderNotes] = useState('');
  const [viewRevision, setViewRevision] = useState<SalesRevision | null>(null);
  const [quotationDocument, setQuotationDocument] = useState<QuotationDocument | null>(null);
  const [quotationSaveState, setQuotationSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pdfBusy, setPdfBusy] = useState(false);
  const quotationDirty = useRef(false);
  const quotationReady = useRef(false);
  const savedQuotationKey = useRef('');
  const saveGeneration = useRef(0);
  const pauseQuotationSave = useRef(false);
  const quotationSaveFlight = useRef<Promise<void> | null>(null);
  const quotationLatest = useRef({ startDate: '', document: null as QuotationDocument | null });
  const sheetRef = useRef<HTMLDivElement>(null);
  const [closure, setClosureValue] = useState<'LOST' | 'CANCELLED'>('LOST');
  const [closureReason, setClosureReason] = useState('');
  const [clientFiles, setClientFiles] = useState<File[]>([]);
  const [poFile, setPoFile] = useState<File | null>(null);
  const [jobOpen, setJobOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [jobSaving, setJobSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [tradeLicenseNumber, setTradeLicenseNumber] = useState('');
  const [tradeLicenseAuthority, setTradeLicenseAuthority] = useState('');
  const [tradeLicenseExpiry, setTradeLicenseExpiry] = useState('');
  const [trnNumber, setTrnNumber] = useState('');
  const [trnExpiry, setTrnExpiry] = useState('');

  useEffect(() => {
    if (!record) return;
    setNewCustomer(false);
    setQueryNumber(record.queryNumber);
    setCustomerId(record.customerId);
    setProjectLocation(record.projectLocation);
    setProjectDescription(record.projectDescription);
    setProjectScope(record.projectScope);
    setSalesmanId(record.salesmanId);
    setExtraNotes(record.extraNotes ?? '');
    const accepted = record.options.findIndex((option) => option.isAccepted);
    if (accepted >= 0) setAcceptedIndex(accepted);
    else if (acceptedForRecord.current !== record.id) setAcceptedIndex(null);
    acceptedForRecord.current = record.id;
    setPoDate(dateInputValue(record.poDate));
    setPoValue(record.poValue != null ? String(record.poValue) : '');
    setBudgetDetails(record.budgetDetails ?? '');
    setPurchaseOrderNotes(record.purchaseOrderNotes ?? '');
    if (!quotationDirty.current) {
      quotationReady.current = false;
      setStartDate(dateInputValue(record.startDate));
      setQuotationDocument(documentFromRecord(record));
    }
  }, [record]);

  useEffect(() => {
    if (id || salesmanId || !session?.user?.id) return;
    const mine = (salesmenQuery.data ?? []).find((person) => person.id === session.user.id);
    if (mine) setSalesmanId(mine.id);
  }, [id, salesmanId, salesmenQuery.data, session?.user?.id]);

  const customerItems = useMemo(
    () =>
      ((customersQuery.data ?? []) as Customer[]).map((customer) => ({
        id: customer.id,
        label: customer.phone ? `${customer.name} · ${customer.phone}` : customer.name,
      })),
    [customersQuery.data],
  );
  const salesmanItems = useMemo(
    () =>
      (salesmenQuery.data ?? []).map((person) => ({
        id: person.id,
        label: person.name || person.email,
        searchText: person.email,
      })),
    [salesmenQuery.data],
  );

  const lockedQuery = Boolean(record && record.stage !== 'QUERY');
  const quotationEditable = record?.stage === 'QUOTATION' && record.closure === 'OPEN' && access.quotationManage;
  quotationLatest.current = { startDate, document: quotationDocument };

  useEffect(() => {
    if (section !== 'quotation' || !quotationEditable || !id || !quotationDocument) return;
    const key = JSON.stringify({ startDate, quotationDocument });
    if (!quotationReady.current) {
      savedQuotationKey.current = key;
      quotationReady.current = true;
      quotationDirty.current = false;
      return;
    }
    if (key === savedQuotationKey.current) {
      quotationDirty.current = false;
      setQuotationSaveState((current) => (current === 'saving' ? 'saved' : current));
      return;
    }
    quotationDirty.current = true;
    const timer = window.setTimeout(() => {
      if (pauseQuotationSave.current) return;
      const generation = ++saveGeneration.current;
      const payload = quotationLatest.current;
      if (!payload.document) return;
      const payloadKey = JSON.stringify({ startDate: payload.startDate, quotationDocument: payload.document });
      setQuotationSaveState('saving');
      const flight = updateQuery({ id, body: { startDate: payload.startDate, quotationDocument: payload.document } })
        .unwrap()
        .then(() => {
          if (saveGeneration.current !== generation) return;
          savedQuotationKey.current = payloadKey;
          const currentKey = JSON.stringify({
            startDate: quotationLatest.current.startDate,
            quotationDocument: quotationLatest.current.document,
          });
          if (currentKey === payloadKey) {
            quotationDirty.current = false;
            setQuotationSaveState('saved');
          }
        })
        .catch((error: unknown) => {
          if (saveGeneration.current !== generation) return;
          setQuotationSaveState('error');
          toast.error(apiError(error));
        });
      quotationSaveFlight.current = flight;
      void flight.finally(() => {
        if (quotationSaveFlight.current === flight) quotationSaveFlight.current = null;
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [id, quotationDocument, quotationEditable, section, startDate, updateQuery]);
  const purchaseOrderEditable = record?.stage === 'PURCHASE_ORDER' && record.closure === 'OPEN' && access.purchaseOrdersManage;
  const currency = record?.currencyCode ?? '';
  const quotationLabel = record?.quotationNumber || record?.queryNumber || 'New query';
  const queryOpen = !record || (record.stage === 'QUERY' && record.closure === 'OPEN');

  async function uploadFiles(recordId: string, files: File[], kind: 'CLIENT' | 'PO') {
    for (const file of files) {
      const body = new FormData();
      body.set('file', file);
      body.set('kind', kind);
      const response = await fetch(`/api/sales/queries/${recordId}/attachments`, { method: 'POST', body });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'File upload failed');
    }
  }

  function quotationBody() {
    return { startDate, quotationDocument };
  }

  async function settleQuotationSave() {
    pauseQuotationSave.current = true;
    const pending = quotationSaveFlight.current;
    if (pending) await pending.catch(() => undefined);
  }

  async function openQuotationPdf(copy: 'quotation' | 'po') {
    if (!id || !quotationDocument || !sheetRef.current || pdfBusy) return;
    setPdfBusy(true);
    try {
      const result = await downloadQuotationPdf(sheetRef.current, quotationFileName(quotationDocument, record?.quotationNumber || ''));
      if (result === 'cancelled') return;
      toast.success('PDF downloaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : apiError(error));
      return;
    } finally {
      setPdfBusy(false);
    }
    try {
      if (copy === 'quotation' && quotationEditable) {
        await updateQuery({ id, body: quotationBody() }).unwrap();
      }
      if (copy === 'po' && purchaseOrderEditable) {
        await updateQuery({
          id,
          body: {
            budgetDetails,
            purchaseOrderNotes,
            poDate: poDate || null,
            poValue: poValue === '' ? null : Number(poValue),
          },
        }).unwrap();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : apiError(error));
    }
  }

  async function onRevise() {
    const base = record?.quotationNumber?.replace(/-R\d+$/, '') ?? '';
    const nextRevision = record ? `${base}-R${record.quotationRevision + 1}` : '';
    if (!id || !quotationDocument || !confirm(`Issue the next revision? The quotation number will be ${nextRevision}.`)) return;
    try {
      await updateQuery({ id, body: quotationBody() }).unwrap();
      await revise(id).unwrap();
      toast.success('Revision issued');
      router.push('/sales/quotations');
    } catch (error) {
      toast.error(apiError(error));
    }
  }

  async function onReceivePurchaseOrder() {
    if (!id || !quotationDocument) return;
    const optionCount = optionBlocks(quotationDocument).length;
    if (optionCount > 1 && acceptedIndex == null) {
      toast.error('Choose the accepted option');
      return;
    }
    try {
      await settleQuotationSave();
      const saved = await updateQuery({ id, body: quotationBody() }).unwrap();
      const chosen = acceptedOptionId(saved.options, optionCount > 1 ? acceptedIndex ?? 0 : 0);
      await receivePurchaseOrder({
        id,
        body: { acceptedOptionId: chosen },
      }).unwrap();
      if (access.purchaseOrdersView) {
        toast.success('Purchase order received');
        router.push(`/sales/purchase-orders/form?id=${id}`);
      } else {
        toast.success('Purchase order received. You do not have access to open purchase orders.');
        router.push('/sales/quotations');
      }
    } catch (error) {
      pauseQuotationSave.current = false;
      toast.error(apiError(error));
    }
  }

  function customerReady(): boolean {
    if (newCustomer) {
      if (!customerName.trim() || !customerPhone.trim()) {
        toast.error('Enter the new customer name and phone. Phone is required so the same name can be a different customer.');
        return false;
      }
      return true;
    }
    if (!customerId) {
      toast.error('Choose a customer, or add one who is not in the directory.');
      return false;
    }
    return true;
  }

  async function saveQuery() {
    const body = {
      customerId: newCustomer ? null : customerId,
      newCustomer: newCustomer ? { name: customerName, phone: customerPhone, contactPerson } : null,
      projectLocation,
      projectDescription,
      projectScope,
      salesmanId,
      extraNotes,
    };
    if (id) {
      return updateQuery({
        id,
        body: {
          projectLocation,
          projectDescription,
          projectScope,
          salesmanId,
          extraNotes,
          customerId: newCustomer ? null : customerId,
          newCustomer: newCustomer ? { name: customerName, phone: customerPhone, contactPerson } : null,
        },
      }).unwrap();
    }
    return createQuery(body).unwrap();
  }

  async function onSaveQuery() {
    if (!customerReady()) return;
    try {
      const saved = await saveQuery();
      if (clientFiles.length) await uploadFiles(saved.id, clientFiles, 'CLIENT');
      setClientFiles([]);
      toast.success('Query saved');
      router.push('/sales/queries');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : apiError(error));
    }
  }

  function openForward() {
    if (!customerReady()) return;
    setAssigneeId('');
    setAssignOpen(true);
  }

  async function onForwardQuotation() {
    if (!customerReady() || !assigneeId) {
      toast.error('Choose who this quotation is assigned to');
      return;
    }
    try {
      const saved = await saveQuery();
      const targetId = saved?.id ?? id;
      if (!targetId) return;
      if (clientFiles.length) await uploadFiles(targetId, clientFiles, 'CLIENT');
      await forwardQuotation({ id: targetId, assigneeId }).unwrap();
      setAssignOpen(false);
      toast.success('Forwarded to quotation');
      router.push(`/sales/quotations/form?id=${targetId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : apiError(error));
    }
  }

  async function persistPurchaseOrder() {
    if (!id) return;
    await updateQuery({
      id,
      body: {
        budgetDetails,
        purchaseOrderNotes,
        poDate: poDate || null,
        poValue: poValue === '' ? null : Number(poValue),
      },
    }).unwrap();
    if (poFile) {
      await uploadFiles(id, [poFile], 'PO');
      setPoFile(null);
    }
  }

  async function onSavePurchaseOrder() {
    if (!id) return;
    try {
      await persistPurchaseOrder();
      toast.success('Purchase order saved');
      router.push('/sales/purchase-orders');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : apiError(error));
    }
  }

  async function onClosure(next: 'OPEN' | 'LOST' | 'CANCELLED' | 'REJECTED') {
    if (!id) return;
    try {
      await setClosure({ id, closure: next, reason: closureReason }).unwrap();
      toast.success(next === 'OPEN' ? 'Reopened' : next === 'REJECTED' ? 'Query rejected' : 'Status updated');
      if (next === 'REJECTED') router.push('/sales/queries');
    } catch (error) {
      toast.error(apiError(error));
    }
  }

  function openCreateJob() {
    setEmail('');
    setAddress('');
    setTradeLicenseNumber('');
    setTradeLicenseAuthority('');
    setTradeLicenseExpiry('');
    setTrnNumber('');
    setTrnExpiry('');
    setJobOpen(true);
  }

  async function onCreateJob() {
    if (!id || jobSaving) return;
    const value = Number(poValue);
    if (!poDate || !Number.isFinite(value) || value <= 0) {
      toast.error('Enter the PO date and a PO value greater than zero');
      return;
    }
    setJobSaving(true);
    try {
      await persistPurchaseOrder();
      const created = await createJob({
        id,
        body: {
          poDate,
          poValue: value,
          email,
          address,
          tradeLicenseNumber,
          tradeLicenseAuthority,
          tradeLicenseExpiry,
          trnNumber,
          trnExpiry,
        },
      }).unwrap();
      toast.success('Job created');
      setJobOpen(false);
      if (created.job?.id) router.push(`/customers/jobs/${created.job.id}`);
      else router.push('/sales/purchase-orders');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : apiError(error));
    } finally {
      setJobSaving(false);
    }
  }

  const busy =
    createState.isLoading ||
    updateState.isLoading ||
    forwardQuotationState.isLoading ||
    reviseState.isLoading ||
    receivePurchaseOrderState.isLoading ||
    closureState.isLoading ||
    createJobState.isLoading;

  if (id && recordQuery.isError) {
    return <p className="text-sm text-muted-foreground">This record is not available.</p>;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sales</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {section === 'query' ? 'Query' : section === 'quotation' ? 'Quotation' : 'Purchase order'}
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {quotationLabel}
            {record ? ` · ${record.displayCustomerName}` : ''}
          </p>
          {section !== 'query' && record ? (
            <p className="text-sm text-muted-foreground">
              {record.assignedTo ? `Assigned to ${record.assignedTo.name}` : 'Not assigned'}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
            Cancel
          </Button>
          {id ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setLogOpen(true)}>
              Working log
            </Button>
          ) : null}
          {section === 'query' && queryOpen && access.queryManage ? (
            <>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onSaveQuery()}>
                Save
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={openForward}>
                Forward to quotation
              </Button>
            </>
          ) : null}
          {section === 'quotation' && quotationEditable ? (
            <>
              {quotationSaveState === 'saving' ? <span className="self-center text-xs text-muted-foreground">Saving…</span> : null}
              {quotationSaveState === 'saved' ? <span className="self-center text-xs text-muted-foreground">Saved</span> : null}
              {quotationSaveState === 'error' ? <span className="self-center text-xs text-destructive">Not saved</span> : null}
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onRevise()}>
                Revise
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy || pdfBusy || !quotationDocument} onClick={() => void openQuotationPdf('quotation')}>
                {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={() => void onReceivePurchaseOrder()}>
                PO Received
              </Button>
            </>
          ) : null}
          {section === 'purchaseOrder' && record ? (
            <Button type="button" variant="outline" size="sm" disabled={busy || pdfBusy} onClick={() => void openQuotationPdf('po')}>
              {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
            </Button>
          ) : null}
          {section === 'purchaseOrder' && purchaseOrderEditable ? (
            <Button type="button" size="sm" disabled={busy} onClick={() => void onSavePurchaseOrder()}>
              Save
            </Button>
          ) : null}
        </div>
      </header>

      <Section
        eyebrow="Query"
        title="Project"
        description="The query number is assigned when you save. Forwarding assigns a separate quotation number."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className={LABEL_CLASS}>
            Query number
            <input value={id ? queryNumber : 'Assigned when you save'} disabled className={INPUT_CLASS} />
          </label>
          <div>
            <p className={LABEL_CLASS}>Salesman</p>
            <SearchSelect
              items={salesmanItems}
              value={salesmanId}
              onChange={setSalesmanId}
              placeholder="Search salesman…"
              disabled={lockedQuery}
              openOnFocus
              minCharactersToSearch={0}
              inputProps={{ className: INPUT_CLASS }}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className={LABEL_CLASS}>Customer</p>
            {newCustomer ? (
              <div className="mt-1.5 space-y-3">
                <label className={LABEL_CLASS}>
                  Customer name
                  <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={100} disabled={lockedQuery} className={INPUT_CLASS} />
                </label>
                <label className={LABEL_CLASS}>
                  Phone
                  <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} maxLength={30} disabled={lockedQuery} className={INPUT_CLASS} />
                </label>
                <label className={LABEL_CLASS}>
                  Contact person
                  <input value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} maxLength={100} disabled={lockedQuery} className={INPUT_CLASS} />
                </label>
              </div>
            ) : (
              <SearchSelect
                items={customerItems}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Search customers…"
                disabled={lockedQuery}
                openOnFocus
                minCharactersToSearch={0}
                inputProps={{ className: INPUT_CLASS }}
                emptyAction={{
                  label: (query) => `Add "${query}" as a new customer`,
                  onAction: (query) => {
                    setCustomerId('');
                    setCustomerName(query);
                    setCustomerPhone('');
                    setContactPerson('');
                    setNewCustomer(true);
                  },
                }}
              />
            )}
            {!lockedQuery ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setNewCustomer((value) => !value);
                  if (!newCustomer) setCustomerId('');
                }}
              >
                {newCustomer ? 'Pick from directory' : 'Add customer'}
              </Button>
            ) : null}
          </div>
          <label className={LABEL_CLASS}>
            Project location
            <input value={projectLocation} onChange={(event) => setProjectLocation(event.target.value)} disabled={lockedQuery} maxLength={200} className={INPUT_CLASS} />
          </label>
        </div>
        <label className={LABEL_CLASS}>
          Project description
          <textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} disabled={lockedQuery} maxLength={1000} rows={4} className={`${INPUT_CLASS} resize-none`} />
        </label>
        <label className={LABEL_CLASS}>
          Project scope
          <input value={projectScope} onChange={(event) => setProjectScope(event.target.value)} disabled={lockedQuery} maxLength={500} className={INPUT_CLASS} />
        </label>
        <label className={LABEL_CLASS}>
          Extra notes
          <textarea value={extraNotes} onChange={(event) => setExtraNotes(event.target.value)} disabled={lockedQuery} rows={3} className={`${INPUT_CLASS} resize-none`} />
        </label>
        {section === 'query' && !lockedQuery ? (
          <label className={LABEL_CLASS}>
            Client files
            <input type="file" multiple className={INPUT_CLASS} onChange={(event) => setClientFiles(Array.from(event.target.files ?? []))} />
          </label>
        ) : (
          <p className={LABEL_CLASS}>Client files</p>
        )}
        <AttachmentFiles
          files={record?.attachments.filter((file) => file.kind === 'CLIENT') ?? []}
          pending={clientFiles.map((file) => file.name)}
        />
      </Section>

      {section !== 'query' ? (
        <Section eyebrow="Quotation" title={record?.quotationNumber || 'Quotation'} description={record ? `Source query ${record.queryNumber}` : undefined} allowSticky>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={LABEL_CLASS}>
              When to start
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={!quotationEditable} className={INPUT_CLASS} />
            </label>
            {quotationDocument && optionBlocks(quotationDocument).length > 1 ? (
              <label className={LABEL_CLASS}>
                Accepted option
                <select
                  value={acceptedIndex ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAcceptedIndex(value === '' ? null : Number(value));
                  }}
                  disabled={!quotationEditable}
                  className={INPUT_CLASS}
                >
                  <option value="">Choose an option</option>
                  {optionBlocks(quotationDocument).map((block, index) => (
                    <option key={block.id} value={index}>{plainText(block.name) || `Option ${index + 1}`}</option>
                  ))}
                </select>
              </label>
            ) : <span />}
          </div>
          {quotationDocument ? (
            <div ref={sheetRef} className="min-w-0">
              <QuotationSheet
                document={quotationDocument}
                onChange={setQuotationDocument}
                readOnly={!quotationEditable}
                quotationNumber={record?.quotationNumber || ''}
                letterheadUrl={record?.company?.letterheadUrl}
                sourceCustomerName={record?.customer?.name || record?.customerName || ''}
                acceptedOptionIndex={section === 'purchaseOrder' ? acceptedIndex : null}
                po={section === 'purchaseOrder' && record?.poNumber ? { number: record.poNumber, date: poDate, value: poValue } : null}
              />
            </div>
          ) : null}

          {section === 'quotation' && record ? (
            <div className="space-y-3">
              <p className={LABEL_CLASS}>Previous versions</p>
              {record.quotationRevision > 0 && record.revisions.length < record.quotationRevision ? (
                <p className="text-sm text-muted-foreground">Revisions made before this update have no saved copy.</p>
              ) : null}
              {record.revisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No earlier version has been saved.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {record.revisions.map((revision) => (
                    <div key={revision.id} className="flex items-center justify-between gap-3 text-sm">
                      <span>{revision.quotationLabel}</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => setViewRevision(revision)}>
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </Section>
      ) : null}

      {section === 'purchaseOrder' && record ? (
        <Section
          eyebrow="Purchase order"
          title={record.poNumber || 'Purchase order'}
          description={`Quotation ${record.quotationNumber || '—'} · Query ${record.queryNumber}`}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className={LABEL_CLASS}>
              PO number
              <input value={record.poNumber ?? ''} disabled className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              PO date
              <input type="date" value={poDate} onChange={(event) => setPoDate(event.target.value)} disabled={!purchaseOrderEditable} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              PO value {currency}
              <input type="number" step="0.01" value={poValue} onChange={(event) => setPoValue(event.target.value)} disabled={!purchaseOrderEditable} className={INPUT_CLASS} />
            </label>
            {purchaseOrderEditable ? (
              <label className={LABEL_CLASS}>
                PO file
                <input type="file" className={INPUT_CLASS} onChange={(event) => setPoFile(event.target.files?.[0] ?? null)} />
              </label>
            ) : (
              <p className={LABEL_CLASS}>PO file</p>
            )}
          </div>
          <AttachmentFiles
            files={record.attachments.filter((file) => file.kind === 'PO')}
            pending={poFile ? [poFile.name] : []}
          />
          <label className={LABEL_CLASS}>
            Budget details
            <textarea value={budgetDetails} onChange={(event) => setBudgetDetails(event.target.value)} disabled={!purchaseOrderEditable} rows={4} className={`${INPUT_CLASS} resize-none`} />
          </label>
          <label className={LABEL_CLASS}>
            Extra notes
            <textarea value={purchaseOrderNotes} onChange={(event) => setPurchaseOrderNotes(event.target.value)} disabled={!purchaseOrderEditable} rows={3} className={`${INPUT_CLASS} resize-none`} />
          </label>
          {record.job ? (
            <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/customers/jobs/${record.job!.id}`)}>
              Open job {record.job.jobNumber}
            </Button>
          ) : purchaseOrderEditable && access.jobCreate ? (
            <Button type="button" size="sm" onClick={openCreateJob}>
              Create job
            </Button>
          ) : null}
        </Section>
      ) : null}

      {record && record.stage === 'QUERY' && record.closure === 'OPEN' && access.queryManage ? (
        <Section eyebrow="Status" title="Reject">
          <label className={LABEL_CLASS}>
            Reason
            <input value={closureReason} onChange={(event) => setClosureReason(event.target.value)} className={INPUT_CLASS} />
          </label>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onClosure('REJECTED')}>
            Reject
          </Button>
        </Section>
      ) : null}
      {record && record.stage !== 'QUERY' && record.closure === 'OPEN' && !record.jobId && (
        (record.stage === 'QUOTATION' && access.quotationManage) ||
        (record.stage === 'PURCHASE_ORDER' && access.purchaseOrdersManage)
      ) ? (
        <Section eyebrow="Status" title="Lost or cancelled">
          <div className="grid gap-4 md:grid-cols-2">
            <label className={LABEL_CLASS}>
              Status
              <select value={closure} onChange={(event) => setClosureValue(event.target.value as 'LOST' | 'CANCELLED')} className={INPUT_CLASS}>
                <option value="LOST">Lost</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Reason
              <input value={closureReason} onChange={(event) => setClosureReason(event.target.value)} className={INPUT_CLASS} />
            </label>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onClosure(closure)}>
            Mark {closure === 'LOST' ? 'lost' : 'cancelled'}
          </Button>
        </Section>
      ) : null}
      {record && record.closure !== 'OPEN' ? (
        <Section eyebrow="Status" title={record.closure}>
          <p className="text-sm text-muted-foreground">{record.closureReason}</p>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onClosure('OPEN')}>
            Reopen
          </Button>
        </Section>
      ) : null}

      <Modal
        isOpen={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Who should this quotation be assigned to?"
        description="This person can be the salesman, or someone else who has a sales permission."
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={busy || !assigneeId} onClick={() => void onForwardQuotation()}>
              Assign and forward
            </Button>
          </>
        }
      >
        <SearchSelect
          items={salesmanItems}
          value={assigneeId}
          onChange={setAssigneeId}
          placeholder="Search a sales user…"
          openOnFocus
          minCharactersToSearch={0}
          dropdownInPortal
          inputProps={{ className: INPUT_CLASS }}
        />
      </Modal>

      {id && logOpen ? <SalesWorkLogDialog id={id} onClose={() => setLogOpen(false)} /> : null}

      <Modal
        isOpen={Boolean(viewRevision)}
        onClose={() => setViewRevision(null)}
        title={viewRevision?.quotationLabel ?? 'Previous version'}
        description="This version is read-only."
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={() => setViewRevision(null)}>
            Close
          </Button>
        }
      >
        {viewRevision ? (
          <div className="space-y-4 text-sm">
            {readQuotationDocument(viewRevision.snapshot.quotationDocument) ? (
              <div className="overflow-x-auto">
                <QuotationSheet
                  document={readQuotationDocument(viewRevision.snapshot.quotationDocument)!}
                  readOnly
                  quotationNumber={viewRevision.quotationLabel}
                  letterheadUrl={record?.company?.letterheadUrl}
                />
              </div>
            ) : (
            <>
            <p className="text-muted-foreground">
              {viewRevision.snapshot.quotationMode === 'MULTIPLE' ? 'Multiple options' : 'Single option'}
              {viewRevision.snapshot.startDate ? ` · Start ${dateInputValue(viewRevision.snapshot.startDate)}` : ''}
            </p>
            {viewRevision.snapshot.options.map((option, optionIndex) => {
              const subtotal = option.lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);
              return (
                <div key={optionIndex} className="space-y-2 rounded-lg border border-border p-3">
                  <p className="font-medium">{option.name || `Option ${optionIndex + 1}`}</p>
                  {option.lines.map((line, lineIndex) => (
                    <div key={lineIndex}>
                      <p>
                        {line.item} · {line.quantity} × {line.unitPrice} = {Number(line.lineTotal).toFixed(2)}
                      </p>
                      {line.fields.map((field, fieldIndex) => (
                        <p key={fieldIndex} className="text-muted-foreground">
                          {field.value || field.label}
                        </p>
                      ))}
                    </div>
                  ))}
                  <p>VAT {Number(option.vatAmount).toFixed(2)} · Grand total {(subtotal + Number(option.vatAmount || 0)).toFixed(2)}</p>
                </div>
              );
            })}
            </>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={jobOpen}
        onClose={() => !jobSaving && setJobOpen(false)}
        title="Create job"
        description="The job number is assigned when you create the job."
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" disabled={jobSaving} onClick={() => setJobOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={jobSaving} onClick={() => void onCreateJob()}>
              Create job
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Query {record?.queryNumber}. Quotation {record?.quotationNumber}. Purchase order {record?.poNumber}. Customer {record?.displayCustomerName}.
          </p>
          {access.customerEdit ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className={LABEL_CLASS}>Email<input value={email} onChange={(event) => setEmail(event.target.value)} className={INPUT_CLASS} /></label>
              <label className={LABEL_CLASS}>Address<textarea value={address} onChange={(event) => setAddress(event.target.value)} rows={2} className={`${INPUT_CLASS} resize-none`} /></label>
              <label className={LABEL_CLASS}>Trade license<input value={tradeLicenseNumber} onChange={(event) => setTradeLicenseNumber(event.target.value)} className={INPUT_CLASS} /></label>
              <label className={LABEL_CLASS}>Authority<input value={tradeLicenseAuthority} onChange={(event) => setTradeLicenseAuthority(event.target.value)} className={INPUT_CLASS} /></label>
              <label className={LABEL_CLASS}>License expiry<input type="date" value={tradeLicenseExpiry} onChange={(event) => setTradeLicenseExpiry(event.target.value)} className={INPUT_CLASS} /></label>
              <label className={LABEL_CLASS}>TRN<input value={trnNumber} onChange={(event) => setTrnNumber(event.target.value)} className={INPUT_CLASS} /></label>
              <label className={LABEL_CLASS}>TRN expiry<input type="date" value={trnExpiry} onChange={(event) => setTrnExpiry(event.target.value)} className={INPUT_CLASS} /></label>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
