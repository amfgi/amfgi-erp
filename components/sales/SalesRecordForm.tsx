'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import SearchSelect from '@/components/ui/SearchSelect';
import Modal from '@/components/ui/Modal';
import { salesAccess } from '@/lib/sales/access';
import { dateInputValue } from '@/lib/sales/format';
import {
  useCreateJobFromSalesMutation,
  useCreateSalesQueryMutation,
  useReceivePurchaseOrderMutation,
  useForwardSalesToQuotationMutation,
  useGetCustomersQuery,
  useGetSalesmenQuery,
  useGetSalesQueryQuery,
  useReviseSalesQuotationMutation,
  useSetSalesClosureMutation,
  useUpdateSalesQueryMutation,
  type Customer,
} from '@/store/hooks';
import type { SalesOption, SalesRevision } from '@/store/api/endpoints/sales';

const INPUT_CLASS =
  'mt-1.5 w-full rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60';
const LINE_INPUT_CLASS = INPUT_CLASS.replace(' w-full', '');
const LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

type FieldDraft = { label: string; value: string };
type LineDraft = { item: string; description: string; unitPrice: string; quantity: string; fields: FieldDraft[] };
type OptionDraft = { id?: string; name: string; vatAmount: string; lines: LineDraft[] };

function emptyLine(): LineDraft {
  return { item: '', description: '', unitPrice: '', quantity: '', fields: [] };
}

function emptyOption(index: number): OptionDraft {
  return { name: `Option ${index + 1}`, vatAmount: '0', lines: [emptyLine()] };
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
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
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
  const [quotationMode, setQuotationMode] = useState<'SINGLE' | 'MULTIPLE'>('SINGLE');
  const [options, setOptions] = useState<OptionDraft[]>([emptyOption(0)]);
  const [acceptedIndex, setAcceptedIndex] = useState(0);
  const [poDate, setPoDate] = useState('');
  const [poValue, setPoValue] = useState('');
  const [budgetDetails, setBudgetDetails] = useState('');
  const [purchaseOrderNotes, setPurchaseOrderNotes] = useState('');
  const [viewRevision, setViewRevision] = useState<SalesRevision | null>(null);
  const [activeExtra, setActiveExtra] = useState<string | null>(null);
  const [closure, setClosureValue] = useState<'LOST' | 'CANCELLED'>('LOST');
  const [closureReason, setClosureReason] = useState('');
  const [clientFiles, setClientFiles] = useState<File[]>([]);
  const [poFile, setPoFile] = useState<File | null>(null);
  const [jobOpen, setJobOpen] = useState(false);
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
    setStartDate(dateInputValue(record.startDate));
    setQuotationMode(record.quotationMode);
    const accepted = record.options.findIndex((option) => option.isAccepted);
    setAcceptedIndex(accepted >= 0 ? accepted : 0);
    setPoDate(dateInputValue(record.poDate));
    setPoValue(record.poValue != null ? String(record.poValue) : '');
    setBudgetDetails(record.budgetDetails ?? '');
    setPurchaseOrderNotes(record.purchaseOrderNotes ?? '');
    if (record.options.length) {
      setOptions(
        record.options.map((option: SalesOption) => ({
          id: option.id,
          name: option.name,
          vatAmount: String(option.vatAmount),
          lines: option.lines.map((line) => ({
            item: line.item,
            description: line.description ?? '',
            unitPrice: String(line.unitPrice),
            quantity: String(line.quantity),
            fields: (line.fields ?? []).map((field) => ({ label: field.label, value: field.value })),
          })),
        })),
      );
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

  function optionPayload() {
    return options.map((option) => ({
      name: option.name,
      vatAmount: Number(option.vatAmount || 0),
      lines: option.lines.map((line) => ({
        item: line.item,
        description: line.description,
        unitPrice: Number(line.unitPrice || 0),
        quantity: Number(line.quantity || 0),
        fields: line.fields.map((field) => ({ label: field.label, value: field.value })),
      })),
    }));
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

  async function onForwardQuotation() {
    if (!id && !customerReady()) return;
    try {
      const saved = id ? record : await saveQuery();
      const targetId = saved?.id ?? id;
      if (!targetId) return;
      if (clientFiles.length) await uploadFiles(targetId, clientFiles, 'CLIENT');
      await forwardQuotation(targetId).unwrap();
      toast.success('Forwarded to quotation');
      router.push('/sales/queries');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : apiError(error));
    }
  }

  async function onSaveQuotation() {
    if (!id) return;
    try {
      await updateQuery({ id, body: { startDate, quotationMode, options: optionPayload() } }).unwrap();
      if (clientFiles.length) await uploadFiles(id, clientFiles, 'CLIENT');
      setClientFiles([]);
      toast.success('Quotation saved');
      router.push('/sales/quotations');
    } catch (error) {
      toast.error(apiError(error));
    }
  }

  async function onRevise() {
    const base = record?.quotationNumber?.replace(/-R\d+$/, '') ?? '';
    const nextRevision = record ? `${base}-R${record.quotationRevision + 1}` : '';
    if (!id || !confirm(`Issue the next revision? The quotation number will be ${nextRevision}.`)) return;
    try {
      await updateQuery({ id, body: { startDate, quotationMode, options: optionPayload() } }).unwrap();
      await revise(id).unwrap();
      toast.success('Revision issued');
      router.push('/sales/quotations');
    } catch (error) {
      toast.error(apiError(error));
    }
  }

  async function onReceivePurchaseOrder() {
    if (!id) return;
    try {
      const saved = await updateQuery({ id, body: { startDate, quotationMode, options: optionPayload() } }).unwrap();
      const chosen = saved.options[quotationMode === 'SINGLE' ? 0 : acceptedIndex]?.id;
      await receivePurchaseOrder({
        id,
        body: { acceptedOptionId: chosen },
      }).unwrap();
      toast.success('Purchase order received');
      router.push('/sales/quotations');
    } catch (error) {
      toast.error(apiError(error));
    }
  }

  async function onSavePurchaseOrder() {
    if (!id) return;
    try {
      await updateQuery({
        id,
        body: {
          budgetDetails,
          purchaseOrderNotes,
          poDate: poDate || null,
          poValue: poValue === '' ? null : Number(poValue),
        },
      }).unwrap();
      if (poFile) await uploadFiles(id, [poFile], 'PO');
      setPoFile(null);
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
    if (!id) return;
    const value = Number(poValue);
    if (!poDate || !Number.isFinite(value) || value <= 0) {
      toast.error('Enter the PO date and a PO value greater than zero');
      return;
    }
    try {
      await createJob({
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
      router.push('/sales/purchase-orders');
    } catch (error) {
      toast.error(apiError(error));
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
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
            Cancel
          </Button>
          {section === 'query' && queryOpen && access.queryManage ? (
            <>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onSaveQuery()}>
                Save
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={() => void onForwardQuotation()}>
                Forward to quotation
              </Button>
            </>
          ) : null}
          {section === 'quotation' && quotationEditable ? (
            <>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onSaveQuotation()}>
                Save
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onRevise()}>
                Revise
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={() => void onReceivePurchaseOrder()}>
                PO Received
              </Button>
            </>
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
          <input value={projectScope} onChange={(event) => setProjectScope(event.target.value)} disabled={lockedQuery} maxLength={120} className={INPUT_CLASS} />
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
        ) : null}
        {record?.attachments.filter((file) => file.kind === 'CLIENT').length ? (
          <div className="space-y-2">
            {record.attachments
              .filter((file) => file.kind === 'CLIENT')
              .map((file) => (
                <a key={file.id} href={`/api/sales/attachments/${file.id}/download`} className="block text-sm text-primary">
                  {file.fileName}
                </a>
              ))}
          </div>
        ) : null}
      </Section>

      {section !== 'query' ? (
        <Section eyebrow="Quotation" title={record?.quotationNumber || 'Quotation'} description={record ? `Source query ${record.queryNumber}` : undefined}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={LABEL_CLASS}>
              When to start
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={!quotationEditable} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Options
              <select
                value={quotationMode}
                onChange={(event) => setQuotationMode(event.target.value as 'SINGLE' | 'MULTIPLE')}
                disabled={!quotationEditable}
                className={INPUT_CLASS}
              >
                <option value="SINGLE">Single</option>
                <option value="MULTIPLE">Multiple</option>
              </select>
            </label>
          </div>
          {options.map((option, optionIndex) => {
            const subtotal = option.lines.reduce((sum, line) => sum + Number(line.unitPrice || 0) * Number(line.quantity || 0), 0);
            const gross = subtotal + Number(option.vatAmount || 0);
            return (
              <div key={option.id ?? optionIndex} className="min-w-0 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <label className={LABEL_CLASS}>
                    Option
                    <input
                      value={option.name}
                      disabled={!quotationEditable}
                      onChange={(event) =>
                        setOptions((current) => current.map((item, index) => (index === optionIndex ? { ...item, name: event.target.value } : item)))
                      }
                      className={INPUT_CLASS}
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-4">
                    {quotationMode === 'MULTIPLE' && quotationEditable ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="accepted-option"
                          checked={acceptedIndex === optionIndex}
                          onChange={() => setAcceptedIndex(optionIndex)}
                        />
                        Client accepted
                      </label>
                    ) : null}
                    {quotationEditable && options.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOptions((current) => current.filter((_, index) => index !== optionIndex));
                          setAcceptedIndex((current) => {
                            if (current === optionIndex) return 0;
                            if (current > optionIndex) return current - 1;
                            return current;
                          });
                        }}
                        className="text-xs font-semibold text-destructive hover:underline"
                      >
                        Remove option
                      </button>
                    ) : null}
                  </div>
                </div>
                {option.lines.map((line, lineIndex) => (
                  <div key={lineIndex} className="min-w-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Line {lineIndex + 1}</p>
                      {quotationEditable && option.lines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setOptions((current) =>
                              current.map((item, index) =>
                                index === optionIndex
                                  ? { ...item, lines: item.lines.filter((_, rowIndex) => rowIndex !== lineIndex) }
                                  : item,
                              ),
                            )
                          }
                          className="text-xs font-semibold text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <div className="flex w-full min-w-0 items-end gap-2">
                      <input placeholder="Item" value={line.item} disabled={!quotationEditable} className={`${LINE_INPUT_CLASS} min-w-0 flex-1 basis-0`} onChange={(event) => setOptions((current) => current.map((item, index) => index === optionIndex ? { ...item, lines: item.lines.map((row, rowIndex) => rowIndex === lineIndex ? { ...row, item: event.target.value } : row) } : item))} />
                      <input placeholder="Description" value={line.description} disabled={!quotationEditable} className={`${LINE_INPUT_CLASS} min-w-0 flex-1 basis-0`} onChange={(event) => setOptions((current) => current.map((item, index) => index === optionIndex ? { ...item, lines: item.lines.map((row, rowIndex) => rowIndex === lineIndex ? { ...row, description: event.target.value } : row) } : item))} />
                      <input placeholder="Unit price" type="number" step="0.01" value={line.unitPrice} disabled={!quotationEditable} className={`${LINE_INPUT_CLASS} w-28 shrink-0`} onChange={(event) => setOptions((current) => current.map((item, index) => index === optionIndex ? { ...item, lines: item.lines.map((row, rowIndex) => rowIndex === lineIndex ? { ...row, unitPrice: event.target.value } : row) } : item))} />
                      <input placeholder="Quantity" type="number" step="0.001" value={line.quantity} disabled={!quotationEditable} className={`${LINE_INPUT_CLASS} w-24 shrink-0`} onChange={(event) => setOptions((current) => current.map((item, index) => index === optionIndex ? { ...item, lines: item.lines.map((row, rowIndex) => rowIndex === lineIndex ? { ...row, quantity: event.target.value } : row) } : item))} />
                      {line.fields.length ? (
                        <div className="flex min-w-0 flex-[1.4] basis-0 items-end gap-1">
                          {line.fields.map((field, fieldIndex) => {
                            const extraKey = `${optionIndex}-${lineIndex}-${fieldIndex}`;
                            const expanded = activeExtra === extraKey;
                            return (
                              <div key={extraKey} className={`flex min-w-0 items-center gap-0.5 ${expanded ? 'flex-[2.5]' : 'flex-1'}`}>
                                <input
                                  placeholder="Extra"
                                  value={field.value}
                                  disabled={!quotationEditable}
                                  className={`${LINE_INPUT_CLASS} min-w-0 flex-1 basis-0 px-2`}
                                  onFocus={() => setActiveExtra(extraKey)}
                                  onBlur={() => setActiveExtra((current) => (current === extraKey ? null : current))}
                                  onChange={(event) =>
                                    setOptions((current) =>
                                      current.map((item, index) =>
                                        index === optionIndex
                                          ? {
                                              ...item,
                                              lines: item.lines.map((row, rowIndex) =>
                                                rowIndex === lineIndex
                                                  ? {
                                                      ...row,
                                                      fields: row.fields.map((entry, entryIndex) =>
                                                        entryIndex === fieldIndex
                                                          ? { label: entry.label.trim() || 'Extra', value: event.target.value }
                                                          : entry,
                                                      ),
                                                    }
                                                  : row,
                                              ),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                                {quotationEditable ? (
                                  <button
                                    type="button"
                                    aria-label="Remove field"
                                    className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() =>
                                      setOptions((current) =>
                                        current.map((item, index) =>
                                          index === optionIndex
                                            ? {
                                                ...item,
                                                lines: item.lines.map((row, rowIndex) =>
                                                  rowIndex === lineIndex
                                                    ? { ...row, fields: row.fields.filter((_, entryIndex) => entryIndex !== fieldIndex) }
                                                    : row,
                                                ),
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      {quotationEditable ? (
                        <button
                          type="button"
                          aria-label="Add field"
                          title="Add field"
                          className="inline-flex size-11 shrink-0 items-center justify-center self-end rounded-md border border-border text-foreground hover:bg-muted"
                          onClick={() =>
                            setOptions((current) =>
                              current.map((item, index) =>
                                index === optionIndex
                                  ? {
                                      ...item,
                                      lines: item.lines.map((row, rowIndex) =>
                                        rowIndex === lineIndex
                                          ? { ...row, fields: [...row.fields, { label: 'Extra', value: '' }] }
                                          : row,
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <Plus className="size-4" />
                        </button>
                      ) : null}
                      <p className="w-24 shrink-0 self-end py-3 text-right text-sm text-foreground">
                        {currency} {(Number(line.unitPrice || 0) * Number(line.quantity || 0)).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
                {quotationEditable ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setOptions((current) => current.map((item, index) => index === optionIndex ? { ...item, lines: [...item.lines, emptyLine()] } : item))}>
                    Add line
                  </Button>
                ) : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <label className={LABEL_CLASS}>
                    VAT amount {currency}
                    <input
                      type="number"
                      step="0.01"
                      value={option.vatAmount}
                      disabled={!quotationEditable}
                      onChange={(event) => setOptions((current) => current.map((item, index) => index === optionIndex ? { ...item, vatAmount: event.target.value } : item))}
                      className={INPUT_CLASS}
                    />
                  </label>
                  <label className={LABEL_CLASS}>
                    Grand total {currency}
                    <input readOnly value={gross.toFixed(2)} className={INPUT_CLASS} />
                  </label>
                </div>
              </div>
            );
          })}
          {quotationEditable && quotationMode === 'MULTIPLE' ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setOptions((current) => [...current, emptyOption(current.length)])}>
              Add option
            </Button>
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
            ) : null}
          </div>
          {record.attachments.filter((file) => file.kind === 'PO').map((file) => (
            <a key={file.id} href={`/api/sales/attachments/${file.id}/download`} className="block text-sm text-primary">
              {file.fileName}
            </a>
          ))}
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
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={jobOpen}
        onClose={() => !createJobState.isLoading && setJobOpen(false)}
        title="Create job"
        description="The job number is assigned when you create the job."
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setJobOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={createJobState.isLoading} onClick={() => void onCreateJob()}>
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
