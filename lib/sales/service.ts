import { Prisma, type SalesAttachmentKind, type SalesClosure, type SalesQuotationMode, type SalesStage } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { readCompanyOperationalSettings } from '@/lib/utils/companyOperationalSettings';
import { parsePartyListDateInput } from '@/lib/partyListsApi';

import {
  optionsFromDocument,
  plainText,
  readQuotationDocument,
} from './quotationDocument';
import { canSeeStage, hidesPurchaseOrders, type SalesAccess } from './access';
import { findSalesUser, listSalesUsers } from './salesUsers';
import { allocateJobNumber } from '@/lib/jobs/allocateJobNumber';
import { assignNextDocumentNumber } from '@/lib/sales/nextDocumentSerial';
import { closureWorkDetail, writeSalesWorkLog } from './workLog';
import {
  type DocumentKind,
  formatQuotationNumber,
  phoneDigits,
  queryNumberKey,
} from './format';

export class SalesError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const recordInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      contactPerson: true,
      email: true,
      address: true,
      tradeLicenseNumber: true,
      tradeLicenseAuthority: true,
      tradeLicenseExpiry: true,
      trnNumber: true,
      trnExpiry: true,
    },
  },
  salesman: { select: { id: true, name: true, email: true, isActive: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  options: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      lines: {
        orderBy: { sortOrder: 'asc' as const },
        include: { fields: { orderBy: { sortOrder: 'asc' as const } } },
      },
    },
  },
  revisions: { orderBy: { revision: 'asc' as const } },
  attachments: { orderBy: { createdAt: 'asc' as const } },
  job: { select: { id: true, jobNumber: true } },
  company: { select: { letterheadUrl: true, name: true } },
} satisfies Prisma.SalesQueryInclude;

type SalesRecord = Prisma.SalesQueryGetPayload<{ include: typeof recordInclude }>;

function money(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function quantity(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(3));
}

function lineTotal(unitPrice: number, qty: number): Prisma.Decimal {
  return money(unitPrice * qty);
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function withNumberRetry<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!isUniqueConflict(error) || attempt === 4) {
        if (isUniqueConflict(error)) throw new SalesError('That number was just taken. Try again.');
        throw error;
      }
    }
  }
  throw new SalesError('Could not assign the next number');
}

async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  kind: DocumentKind,
): Promise<string> {
  if (kind === 'J') return allocateJobNumber(tx, companyId);
  try {
    return await assignNextDocumentNumber(tx, companyId, kind);
  } catch (error) {
    if (error instanceof Error && error.message === 'Could not assign the next number') {
      throw new SalesError('Could not assign the next number');
    }
    throw error;
  }
}

function optionGross(option: { vatAmount: Prisma.Decimal | number; lines: Array<{ lineTotal: Prisma.Decimal | number }> }) {
  const items = option.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
  return items + Number(option.vatAmount);
}

function quotationGrandTotal(row: {
  acceptedOptionId: string | null;
  options: Array<{ id: string; vatAmount: Prisma.Decimal; lines: Array<{ lineTotal: Prisma.Decimal }> }>;
}) {
  const accepted = row.acceptedOptionId
    ? row.options.find((option) => option.id === row.acceptedOptionId)
    : undefined;
  const counted = accepted ?? row.options[0];
  return counted ? optionGross(counted) : 0;
}

export function presentSalesRecord(record: SalesRecord, currencyCode: string) {
  const options = record.options.map((option) => {
    const subtotal = option.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
    const vat = Number(option.vatAmount);
    return {
      ...option,
      subtotal,
      gross: subtotal + vat,
    };
  });
  return {
    ...record,
    quotationNumber: formatQuotationNumber(record.quotationNumber, record.quotationRevision),
    currencyCode,
    options,
    displayCustomerName: record.customer?.name || record.customerName,
  };
}

async function currencyFor(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { operationalSettings: true },
  });
  return readCompanyOperationalSettings(company?.operationalSettings).currencyCode;
}

async function loadRecord(companyId: string, id: string): Promise<SalesRecord> {
  const record = await prisma.salesQuery.findFirst({
    where: { id, companyId },
    include: recordInclude,
  });
  if (!record) throw new SalesError('Sales record not found', 404);
  return record;
}

function assertVisible(access: SalesAccess, stage: SalesStage) {
  if (!canSeeStage(access, stage)) throw new SalesError('Forbidden', 403);
}

async function lockSalesQuery(tx: Prisma.TransactionClient, companyId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM "SalesQuery" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
}

export async function listSalesRecords(params: {
  companyId: string;
  access: SalesAccess;
  limit: number;
  offset: number;
  search: string;
  stage: SalesStage | null;
  closure: SalesClosure | null;
  excludeClosure?: SalesClosure | null;
  withoutJob?: boolean;
}) {
  if (params.stage && !canSeeStage(params.access, params.stage)) {
    throw new SalesError('Forbidden', 403);
  }
  const where: Prisma.SalesQueryWhereInput = { companyId: params.companyId };
  if (hidesPurchaseOrders(params.access)) where.stage = { not: 'PURCHASE_ORDER' };
  if (params.stage) where.stage = params.stage;
  if (params.closure) where.closure = params.closure;
  if (params.excludeClosure) where.closure = { not: params.excludeClosure };
  if (params.withoutJob) where.jobId = null;
  if (params.search) {
    where.OR = [
      { queryNumber: { contains: params.search, mode: 'insensitive' } },
      { quotationNumber: { contains: params.search, mode: 'insensitive' } },
      { customerName: { contains: params.search, mode: 'insensitive' } },
      { projectLocation: { contains: params.search, mode: 'insensitive' } },
      { poNumber: { contains: params.search, mode: 'insensitive' } },
      { customer: { name: { contains: params.search, mode: 'insensitive' } } },
    ];
  }

  const [total, rows, currencyCode] = await Promise.all([
    prisma.salesQuery.count({ where }),
    prisma.salesQuery.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        salesman: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        job: { select: { id: true, jobNumber: true } },
        options: {
          orderBy: { sortOrder: 'asc' as const },
          select: {
            id: true,
            vatAmount: true,
            lines: { select: { lineTotal: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: params.offset,
      take: params.limit,
    }),
    currencyFor(params.companyId),
  ]);

  return {
    items: rows.map((row) => {
      const { options, ...rest } = row;
      return {
        ...rest,
        quotationNumber: formatQuotationNumber(row.quotationNumber, row.quotationRevision),
        displayCustomerName: row.customer?.name || row.customerName,
        currencyCode,
        grandTotal: quotationGrandTotal(row),
      };
    }),
    total,
    currencyCode,
  };
}

export async function getSalesRecord(companyId: string, id: string, access: SalesAccess) {
  const record = await loadRecord(companyId, id);
  assertVisible(access, record.stage);
  const currencyCode = await currencyFor(companyId);
  return presentSalesRecord(record, currencyCode);
}

type NewCustomerInput = {
  name: string;
  phone: string;
  contactPerson?: string | null;
};

async function resolveCustomer(
  tx: Prisma.TransactionClient,
  companyId: string,
  input: { customerId?: string | null; newCustomer?: NewCustomerInput | null },
): Promise<{ id: string; name: string; created: boolean }> {
  const selectedId = input.customerId?.trim();
  if (selectedId) {
    const customer = await tx.customer.findFirst({
      where: { id: selectedId, companyId },
      select: { id: true, name: true },
    });
    if (!customer) throw new SalesError('Customer not found');
    return { ...customer, created: false };
  }

  const draft = input.newCustomer;
  if (!draft?.name?.trim() || !draft.phone?.trim()) {
    throw new SalesError('Choose a customer, or enter a new customer name and phone');
  }
  const name = draft.name.trim();
  const phone = draft.phone.trim();
  const contactPerson = draft.contactPerson?.trim() || null;
  const digits = phoneDigits(phone);
  if (!digits) throw new SalesError('Enter a phone number for the new customer');

  const sameName = await tx.customer.findMany({
    where: { companyId, name: { equals: name, mode: 'insensitive' } },
    include: { contacts: { select: { phone: true } } },
  });
  const matches = sameName.filter((customer) => {
    const numbers = [customer.phone, ...customer.contacts.map((contact) => contact.phone)];
    return numbers.some((value) => phoneDigits(value) === digits);
  });
  if (matches.length > 1) {
    throw new SalesError('More than one customer has this name and phone. Pick one from the directory.');
  }
  if (matches.length === 1) {
    const existing = matches[0];
    await tx.customer.update({
      where: { id: existing.id },
      data: {
        ...(existing.phone?.trim() ? {} : { phone }),
        ...(existing.contactPerson?.trim() || !contactPerson ? {} : { contactPerson }),
      },
    });
    if (contactPerson) {
      const contact = await tx.customerContact.findFirst({
        where: { companyId, customerId: existing.id, contactName: contactPerson },
        select: { id: true, phone: true },
      });
      if (!contact) {
        await tx.customerContact.create({
          data: { companyId, customerId: existing.id, contactName: contactPerson, phone, sortOrder: 0 },
        });
      } else if (!contact.phone?.trim()) {
        await tx.customerContact.update({ where: { id: contact.id }, data: { phone } });
      }
    }
    return { id: existing.id, name: existing.name, created: false };
  }

  const created = await tx.customer.create({
    data: {
      companyId,
      name,
      phone,
      contactPerson,
      source: 'LOCAL',
      isActive: true,
    },
    select: { id: true, name: true },
  });
  if (contactPerson) {
    await tx.customerContact.create({
      data: { companyId, customerId: created.id, contactName: contactPerson, phone, sortOrder: 0 },
    });
  }
  return { ...created, created: true };
}

async function assertSalesman(companyId: string, salesmanId: string) {
  const user = await findSalesUser(companyId, salesmanId);
  if (!user) throw new SalesError('Choose an active user who has a sales permission.');
  return user;
}

export type SalesOptionInput = {
  name: string;
  vatAmount: number;
  lines: Array<{
    item: string;
    description?: string | null;
    unitPrice: number;
    quantity: number;
    fields?: Array<{ label: string; value?: string | null }>;
  }>;
};

function assertOptions(mode: SalesQuotationMode, options: SalesOptionInput[], forForward: boolean) {
  if (mode === 'SINGLE' && options.length > 1) {
    throw new SalesError('Remove the extra options before switching to a single quotation.');
  }
  for (const option of options) {
    if (option.vatAmount < 0) throw new SalesError('VAT cannot be negative');
    if (forForward && option.lines.length === 0) {
      throw new SalesError('Each quotation option needs at least one line');
    }
    for (const line of option.lines) {
      if (!line.item.trim()) throw new SalesError('Each line needs an item');
      if (line.unitPrice < 0 || line.quantity < 0) throw new SalesError('Price and quantity cannot be negative');
      if (forForward && line.quantity <= 0) throw new SalesError('Each line needs a quantity greater than zero');
    }
  }
}

async function replaceOptions(
  tx: Prisma.TransactionClient,
  record: { id: string; companyId: string },
  options: SalesOptionInput[],
) {
  await tx.salesQuery.update({
    where: { id: record.id },
    data: { acceptedOptionId: null },
  });
  await tx.salesQuotationOption.deleteMany({ where: { companyId: record.companyId, salesQueryId: record.id } });
  for (const [index, option] of options.entries()) {
    const created = await tx.salesQuotationOption.create({
      data: {
        companyId: record.companyId,
        salesQueryId: record.id,
        name: option.name.trim() || `Option ${index + 1}`,
        sortOrder: index,
        vatAmount: money(option.vatAmount || 0),
      },
    });
    for (const [lineIndex, line] of option.lines.entries()) {
      const createdLine = await tx.salesQuotationLine.create({
        data: {
          companyId: record.companyId,
          optionId: created.id,
          item: line.item.trim(),
          description: line.description?.trim() || null,
          unitPrice: money(line.unitPrice),
          quantity: quantity(line.quantity),
          lineTotal: lineTotal(line.unitPrice, line.quantity),
          sortOrder: lineIndex,
        },
        select: { id: true },
      });
      const fields = (line.fields ?? []).filter((field) => field.label.trim());
      if (!fields.length) continue;
      await tx.salesQuotationLineField.createMany({
        data: fields.map((field, fieldIndex) => ({
          companyId: record.companyId,
          lineId: createdLine.id,
          label: field.label.trim(),
          value: field.value?.trim() || '',
          sortOrder: fieldIndex,
        })),
      });
    }
  }
}

export async function createSalesQuery(params: {
  companyId: string;
  userId: string;
  access: SalesAccess;
  customerId?: string | null;
  newCustomer?: NewCustomerInput | null;
  projectLocation: string;
  projectDescription: string;
  projectScope: string;
  salesmanId: string;
  extraNotes?: string | null;
  logDetail?: string | null;
}) {
  if (!params.access.queryManage) throw new SalesError('Forbidden', 403);
  if (!params.customerId && !params.access.customerCreate) {
    throw new SalesError('You cannot create a customer', 403);
  }
  await assertSalesman(params.companyId, params.salesmanId);

  const created = await withNumberRetry(() => prisma.$transaction(async (tx) => {
    const queryNumber = await nextDocumentNumber(tx, params.companyId, 'QR');
    const customer = await resolveCustomer(tx, params.companyId, {
      customerId: params.customerId,
      newCustomer: params.newCustomer,
    });
    const row = await tx.salesQuery.create({
      data: {
        companyId: params.companyId,
        queryNumber,
        queryNumberKey: queryNumberKey(queryNumber),
        customerId: customer.id,
        customerName: customer.name,
        projectLocation: params.projectLocation.trim(),
        projectDescription: params.projectDescription.trim(),
        projectScope: params.projectScope.trim(),
        salesmanId: params.salesmanId,
        extraNotes: params.extraNotes?.trim() || null,
        createdById: params.userId,
      },
      select: { id: true },
    });
    await writeSalesWorkLog(tx, {
      companyId: params.companyId,
      salesQueryId: row.id,
      actorId: params.userId,
      action: 'CREATED',
      detail: params.logDetail,
    });
    return { id: row.id, customerCreated: customer.created };
  }));
  const record = await getSalesRecord(params.companyId, created.id, params.access);
  return { ...record, customerCreated: created.customerCreated };
}

export async function updateSalesQuery(params: {
  companyId: string;
  id: string;
  userId: string;
  access: SalesAccess;
  projectLocation?: string;
  projectDescription?: string;
  projectScope?: string;
  salesmanId?: string;
  extraNotes?: string | null;
  customerId?: string | null;
  newCustomer?: NewCustomerInput | null;
  startDate?: string | null;
  quotationMode?: SalesQuotationMode;
  options?: SalesOptionInput[];
  budgetDetails?: string | null;
  purchaseOrderNotes?: string | null;
  poDate?: string | null;
  poValue?: number | null;
  quotationDocument?: unknown;
}) {
  const current = await loadRecord(params.companyId, params.id);
  assertVisible(params.access, current.stage);
  if (current.closure !== 'OPEN') throw new SalesError('Reopen this record before editing it');

  if (current.stage === 'QUERY') {
    if (!params.access.queryManage) throw new SalesError('Forbidden', 403);
    if ((params.customerId || params.newCustomer) && !params.customerId && !params.access.customerCreate) {
      throw new SalesError('You cannot create a customer', 403);
    }
    if (params.salesmanId) await assertSalesman(params.companyId, params.salesmanId);
    await prisma.$transaction(async (tx) => {
      let customer: { id: string; name: string } | null = null;
      if (params.customerId || params.newCustomer) {
        customer = await resolveCustomer(tx, params.companyId, {
          customerId: params.customerId,
          newCustomer: params.newCustomer,
        });
      }
      await tx.salesQuery.update({
        where: { id: current.id },
        data: {
          ...(params.projectLocation != null ? { projectLocation: params.projectLocation.trim() } : {}),
          ...(params.projectDescription != null ? { projectDescription: params.projectDescription.trim() } : {}),
          ...(params.projectScope != null ? { projectScope: params.projectScope.trim() } : {}),
          ...(params.salesmanId ? { salesmanId: params.salesmanId } : {}),
          ...(params.extraNotes !== undefined ? { extraNotes: params.extraNotes?.trim() || null } : {}),
          ...(customer ? { customerId: customer.id, customerName: customer.name } : {}),
        },
      });
      await writeSalesWorkLog(tx, {
        companyId: params.companyId,
        salesQueryId: current.id,
        actorId: params.userId,
        action: 'SAVED_QUERY',
      });
    });
  } else if (current.stage === 'QUOTATION') {
    if (!params.access.quotationManage) throw new SalesError('Forbidden', 403);
    const savedDocument = params.quotationDocument == null ? null : readQuotationDocument(params.quotationDocument);
    if (params.quotationDocument != null && !savedDocument) {
      throw new SalesError('The quotation document is incomplete');
    }
    const documentOptions = savedDocument ? optionsFromDocument(savedDocument) : null;
    const mode = documentOptions ? (documentOptions.length > 1 ? 'MULTIPLE' : 'SINGLE') : params.quotationMode ?? current.quotationMode;
    const options = documentOptions ?? params.options ?? null;
    if (options) assertOptions(mode, options, false);
    await prisma.$transaction(async (tx) => {
      await lockSalesQuery(tx, params.companyId, current.id);
      const fresh = await tx.salesQuery.findFirst({
        where: { id: current.id, companyId: params.companyId },
        select: { stage: true },
      });
      if (!fresh || fresh.stage !== 'QUOTATION') return;
      if (options) await replaceOptions(tx, current, options);
      await tx.salesQuery.update({
        where: { id: current.id },
        data: {
          quotationMode: mode,
          ...(savedDocument ? { quotationDocument: savedDocument as Prisma.InputJsonValue } : {}),
          ...(params.startDate !== undefined
            ? { startDate: params.startDate ? new Date(`${params.startDate}T00:00:00Z`) : null }
            : {}),
        },
      });
      await writeSalesWorkLog(tx, {
        companyId: params.companyId,
        salesQueryId: current.id,
        actorId: params.userId,
        action: 'EDITED_QUOTATION',
      });
    });
  } else {
    if (!params.access.purchaseOrdersManage) throw new SalesError('Forbidden', 403);
    if (params.poValue != null && params.poValue < 0) throw new SalesError('PO value cannot be negative');
    await prisma.salesQuery.update({
      where: { id: current.id },
      data: {
        ...(params.budgetDetails !== undefined ? { budgetDetails: params.budgetDetails?.trim() || null } : {}),
        ...(params.purchaseOrderNotes !== undefined
          ? { purchaseOrderNotes: params.purchaseOrderNotes?.trim() || null }
          : {}),
        ...(params.poDate !== undefined
          ? { poDate: params.poDate ? new Date(`${params.poDate}T00:00:00Z`) : null }
          : {}),
        ...(params.poValue !== undefined ? { poValue: params.poValue == null ? null : money(params.poValue) } : {}),
      },
    });
    await writeSalesWorkLog(prisma, {
      companyId: params.companyId,
      salesQueryId: current.id,
      actorId: params.userId,
      action: 'SAVED_PO',
    });
  }

  return getSalesRecord(params.companyId, current.id, params.access);
}

export async function forwardToQuotation(params: {
  companyId: string;
  id: string;
  access: SalesAccess;
  assigneeId: string;
  actorId: string;
  sourceNote?: string | null;
}) {
  const { companyId, id, access } = params;
  if (!access.queryManage) throw new SalesError('Forbidden', 403);
  const assignee = await assertSalesman(companyId, params.assigneeId);
  const current = await loadRecord(companyId, id);
  if (current.stage !== 'QUERY') throw new SalesError('This record is already past the query stage');
  if (current.closure !== 'OPEN') throw new SalesError('Reopen this record before forwarding it');
  if (!current.projectLocation || !current.projectDescription || !current.projectScope) {
    throw new SalesError('Location, description, and scope are required');
  }
  const detail = [`Assigned to ${assignee.name}`, params.sourceNote?.trim()].filter(Boolean).join('. ');
  let quotationNumber = '';
  await withNumberRetry(() => prisma.$transaction(async (tx) => {
    const fresh = await tx.salesQuery.findFirst({
      where: { id: current.id, companyId },
      select: { stage: true, quotationNumber: true },
    });
    if (!fresh || fresh.stage !== 'QUERY' || fresh.quotationNumber) {
      throw new SalesError('This record is already past the query stage');
    }
    quotationNumber = await nextDocumentNumber(tx, companyId, 'Q');
    await tx.salesQuery.update({
      where: { id: current.id },
      data: {
        stage: 'QUOTATION',
        assignedToId: assignee.id,
        quotationNumber,
        quotationNumberKey: queryNumberKey(quotationNumber),
        quotationIssuedAt: current.quotationIssuedAt ?? new Date(),
      },
    });
    await writeSalesWorkLog(tx, {
      companyId,
      salesQueryId: current.id,
      actorId: params.actorId,
      action: 'FORWARDED',
      detail,
    });
  }));
  if (!canSeeStage(access, 'QUOTATION')) {
    return {
      id: current.id,
      queryNumber: current.queryNumber,
      customerId: current.customerId,
      stage: 'QUOTATION' as const,
      salesman: current.salesman,
      quotationNumber,
      assignedTo: { id: assignee.id, name: assignee.name },
      forwarded: true as const,
    };
  }
  return getSalesRecord(companyId, id, access);
}

export async function reviseQuotation(params: {
  companyId: string;
  id: string;
  access: SalesAccess;
  actorId: string;
}) {
  const { companyId, id, access } = params;
  if (!access.quotationManage) throw new SalesError('Forbidden', 403);
  const current = await loadRecord(companyId, id);
  if (current.stage !== 'QUOTATION') throw new SalesError('Only a quotation can be revised');
  if (current.closure !== 'OPEN') throw new SalesError('Reopen this record before revising it');
  const next = current.quotationRevision + 1;
  const label = formatQuotationNumber(current.quotationNumber, current.quotationRevision);
  if (!current.quotationNumber || label.length > 100) throw new SalesError('This quotation number cannot take another revision');
  await prisma.$transaction(async (tx) => {
    await tx.salesQuotationRevision.create({
      data: {
        companyId,
        salesQueryId: current.id,
        revision: current.quotationRevision,
        quotationLabel: label,
        snapshot: quotationSnapshot(current),
      },
    });
    await tx.salesQuery.update({
      where: { id: current.id },
      data: { quotationRevision: next, quotationIssuedAt: new Date() },
    });
    await writeSalesWorkLog(tx, {
      companyId,
      salesQueryId: current.id,
      actorId: params.actorId,
      action: 'REVISED',
      detail: formatQuotationNumber(current.quotationNumber, next),
    });
  });
  return getSalesRecord(companyId, id, access);
}

function quotationSnapshot(record: SalesRecord) {
  return {
    quotationMode: record.quotationMode,
    startDate: record.startDate,
    quotationDocument: record.quotationDocument ?? null,
    options: record.options.map((option) => ({
      name: option.name,
      vatAmount: Number(option.vatAmount),
      lines: option.lines.map((line) => ({
        item: line.item,
        description: line.description,
        unitPrice: Number(line.unitPrice),
        quantity: Number(line.quantity),
        lineTotal: Number(line.lineTotal),
        fields: line.fields.map((field) => ({ label: field.label, value: field.value })),
      })),
    })),
  };
}

export async function receivePurchaseOrder(params: {
  companyId: string;
  id: string;
  access: SalesAccess;
  actorId: string;
  acceptedOptionId?: string | null;
}) {
  if (!params.access.quotationManage) throw new SalesError('Forbidden', 403);
  const current = await loadRecord(params.companyId, params.id);
  if (current.stage === 'PURCHASE_ORDER') throw new SalesError('This quotation already has a purchase order');
  if (current.stage !== 'QUOTATION') throw new SalesError('Receive a PO from a quotation');
  if (current.closure !== 'OPEN') throw new SalesError('Reopen this record before receiving a PO');
  if (current.options.length === 0) throw new SalesError('Add a quotation option before receiving a PO');

  assertOptions(current.quotationMode, current.options.map((option) => ({
    name: option.name,
    vatAmount: Number(option.vatAmount),
    lines: option.lines.map((line) => ({
      item: line.item,
      description: line.description,
      unitPrice: Number(line.unitPrice),
      quantity: Number(line.quantity),
      fields: line.fields.map((field) => ({ label: field.label, value: field.value })),
    })),
  })), true);

  let acceptedId = params.acceptedOptionId ?? null;
  if (current.quotationMode === 'SINGLE') {
    acceptedId = current.options[0]?.id ?? null;
  }
  if (!acceptedId || !current.options.some((option) => option.id === acceptedId)) {
    throw new SalesError('Choose the option the client accepted');
  }

  await withNumberRetry(() => prisma.$transaction(async (tx) => {
    await lockSalesQuery(tx, params.companyId, current.id);
    const fresh = await tx.salesQuery.findFirst({
      where: { id: current.id, companyId: params.companyId },
      select: { stage: true, poNumber: true },
    });
    if (!fresh || fresh.stage !== 'QUOTATION' || fresh.poNumber) {
      throw new SalesError('This quotation already has a purchase order');
    }
    const option = await tx.salesQuotationOption.findFirst({
      where: { id: acceptedId!, companyId: params.companyId, salesQueryId: current.id },
      select: { id: true },
    });
    if (!option) throw new SalesError('Choose the option the client accepted');
    const poNumber = await nextDocumentNumber(tx, params.companyId, 'PO');
    await tx.salesQuotationOption.updateMany({
      where: { companyId: params.companyId, salesQueryId: current.id },
      data: { isAccepted: false },
    });
    await tx.salesQuotationOption.update({
      where: { id: acceptedId! },
      data: { isAccepted: true },
    });
    await tx.salesQuery.update({
      where: { id: current.id },
      data: {
        stage: 'PURCHASE_ORDER',
        acceptedOptionId: acceptedId,
        poNumber,
        poNumberKey: queryNumberKey(poNumber),
      },
    });
    await writeSalesWorkLog(tx, {
      companyId: params.companyId,
      salesQueryId: current.id,
      actorId: params.actorId,
      action: 'PO_RECEIVED',
      detail: poNumber,
    });
  }));
  if (!canSeeStage(params.access, 'PURCHASE_ORDER')) {
    return { id: current.id, stage: 'PURCHASE_ORDER' as const, forwarded: true as const };
  }
  return getSalesRecord(params.companyId, params.id, params.access);
}

export async function setSalesClosure(params: {
  companyId: string;
  id: string;
  access: SalesAccess;
  closure: SalesClosure;
  actorId: string;
  reason?: string | null;
}) {
  const current = await loadRecord(params.companyId, params.id);
  assertVisible(params.access, current.stage);
  const allowed =
    (current.stage === 'QUERY' && params.access.queryManage) ||
    (current.stage === 'QUOTATION' && params.access.quotationManage) ||
    (current.stage === 'PURCHASE_ORDER' && params.access.purchaseOrdersManage);
  if (!allowed) throw new SalesError('Forbidden', 403);
  if (params.closure === 'REJECTED' && current.stage !== 'QUERY') {
    throw new SalesError('Only a query can be rejected');
  }
  if (current.stage === 'QUERY' && params.closure !== 'OPEN' && params.closure !== 'REJECTED') {
    throw new SalesError('Reject this query, or reopen it');
  }
  if (current.jobId && params.closure !== 'OPEN') {
    throw new SalesError('This record already has a job. Change the job status from Jobs.');
  }
  await prisma.salesQuery.update({
    where: { id: current.id },
    data:
      params.closure === 'OPEN'
        ? { closure: 'OPEN', closureReason: null, closedAt: null }
        : {
            closure: params.closure,
            closureReason: params.reason?.trim() || null,
            closedAt: new Date(),
          },
  });
  const reason = params.reason?.trim();
  await writeSalesWorkLog(prisma, {
    companyId: params.companyId,
    salesQueryId: current.id,
    actorId: params.actorId,
    action: 'STATUS',
    detail: reason ? `${closureWorkDetail(params.closure)}. ${reason}` : closureWorkDetail(params.closure),
  });
  return getSalesRecord(params.companyId, params.id, params.access);
}

function clipText(value: string, max: number) {
  return value.slice(0, max);
}

function quotationJobCopy(record: SalesRecord) {
  const document = readQuotationDocument(record.quotationDocument);
  const project = clipText(plainText(document?.project), 500);
  const title = clipText(plainText(document?.quoteTitle), 4000);
  const contactName = clipText(plainText(document?.customer.contactName), 200);
  const quotedName = clipText(plainText(document?.customer.name), 200);
  const tel = clipText(plainText(document?.customer.tel) || plainText(document?.customer.contactNumber), 50);
  const email = clipText(plainText(document?.customer.email), 200);
  const city = clipText(plainText(document?.customer.city), 2000);
  const location = project || record.projectLocation;
  const description = title || record.projectDescription;
  return {
    location,
    description,
    contactPerson: contactName || record.customer.contactPerson,
    address: city || null,
    contact: {
      name: contactName || quotedName,
      number: tel || null,
      email: email || null,
    },
  };
}

export async function createJobFromSales(params: {
  companyId: string;
  id: string;
  userId: string;
  access: SalesAccess;
  poDate: string;
  poValue: number;
  email?: string | null;
  address?: string | null;
  tradeLicenseNumber?: string | null;
  tradeLicenseAuthority?: string | null;
  tradeLicenseExpiry?: string | null;
  trnNumber?: string | null;
  trnExpiry?: string | null;
}) {
  if (!params.access.purchaseOrdersManage || !params.access.jobCreate) throw new SalesError('Forbidden', 403);
  const current = await loadRecord(params.companyId, params.id);
  if (current.stage !== 'PURCHASE_ORDER') throw new SalesError('Create a job from a purchase order');
  if (current.closure !== 'OPEN') throw new SalesError('Reopen this record before creating a job');
  if (current.jobId && current.job) return getSalesRecord(params.companyId, params.id, params.access);
  const poDate = params.poDate.trim();
  const poValue = params.poValue;
  if (!poDate || !Number.isFinite(poValue) || poValue <= 0) {
    throw new SalesError('Enter the PO date and a PO value greater than zero before creating a job');
  }
  const poDateValue = new Date(`${poDate}T00:00:00Z`);
  if (Number.isNaN(poDateValue.getTime())) throw new SalesError('Enter the PO date');
  const poAmount = money(poValue);

  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { jobSourceMode: true },
  });
  if (company?.jobSourceMode === 'EXTERNAL_ONLY') {
    throw new SalesError('Parent job creation is disabled for this company. Sync parent jobs from Project Management API.');
  }

  const quotationNumber = formatQuotationNumber(current.quotationNumber, current.quotationRevision);
  const salesPerson = (current.salesman.name || current.salesman.email || '').slice(0, 200);
  const typedAddress = params.address?.trim() || null;
  const copy = quotationJobCopy(current);
  const jobAddress = typedAddress || copy.address;

  try {
    await withNumberRetry(() => prisma.$transaction(async (tx) => {
      const fresh = await tx.salesQuery.findFirst({
        where: { id: current.id, companyId: params.companyId },
        select: { jobId: true },
      });
      if (fresh?.jobId) throw new SalesError('This purchase order already has a job');
      const jobNumber = await nextDocumentNumber(tx, params.companyId, 'J');
      await tx.salesQuery.update({
        where: { id: current.id },
        data: { poDate: poDateValue, poValue: poAmount },
      });
      if (params.access.customerEdit) {
        await tx.customer.update({
          where: { id: current.customerId },
          data: {
            ...(params.email?.trim() ? { email: params.email.trim() } : {}),
            ...(typedAddress ? { address: typedAddress } : {}),
            ...(params.tradeLicenseNumber?.trim()
              ? { tradeLicenseNumber: params.tradeLicenseNumber.trim() }
              : {}),
            ...(params.tradeLicenseAuthority?.trim()
              ? { tradeLicenseAuthority: params.tradeLicenseAuthority.trim() }
              : {}),
            ...(params.tradeLicenseExpiry?.trim()
              ? { tradeLicenseExpiry: parsePartyListDateInput(params.tradeLicenseExpiry) }
              : {}),
            ...(params.trnNumber?.trim() ? { trnNumber: params.trnNumber.trim() } : {}),
            ...(params.trnExpiry?.trim() ? { trnExpiry: parsePartyListDateInput(params.trnExpiry) } : {}),
          },
        });
      }
      const job = await tx.job.create({
        data: {
          companyId: params.companyId,
          jobNumber,
          customerId: current.customerId,
          description: copy.description,
          projectName: copy.location,
          projectDetails: copy.description,
          site: copy.location,
          locationName: copy.location,
          address: jobAddress && jobAddress.length <= 2000 ? jobAddress : null,
          projectQtyArea: current.projectScope,
          startDate: current.startDate ?? new Date(),
          quotationNumber,
          quotationDate: current.quotationIssuedAt,
          salesPerson: salesPerson || null,
          contactPerson: copy.contactPerson,
          lpoNumber: current.poNumber,
          lpoDate: poDateValue,
          lpoValue: poAmount,
          status: 'ACTIVE',
          createdBy: params.userId,
        },
        select: { id: true },
      });
      if (copy.contact.name) {
        await tx.jobContact.create({
          data: {
            companyId: params.companyId,
            jobId: job.id,
            name: copy.contact.name,
            email: copy.contact.email,
            number: copy.contact.number,
            sortOrder: 0,
          },
        });
      }
      const linked = await tx.salesQuery.updateMany({
        where: { id: current.id, companyId: params.companyId, jobId: null },
        data: { jobId: job.id },
      });
      if (linked.count !== 1) throw new SalesError('This purchase order already has a job');
      await writeSalesWorkLog(tx, {
        companyId: params.companyId,
        salesQueryId: current.id,
        actorId: params.userId,
        action: 'JOB_CREATED',
        detail: jobNumber,
      });
    }));
  } catch (error) {
    if (error instanceof SalesError) throw error;
    throw error;
  }

  return getSalesRecord(params.companyId, params.id, params.access);
}

export async function listSalesmen(companyId: string) {
  return listSalesUsers(companyId);
}

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function assertSalesUpload(params: {
  access: SalesAccess;
  stage: SalesStage;
  closure: SalesClosure;
  kind: SalesAttachmentKind;
}) {
  if (params.closure !== 'OPEN') throw new SalesError('Reopen this record before adding a file');
  if (params.kind === 'PO') {
    if (params.stage !== 'PURCHASE_ORDER' || !params.access.purchaseOrdersManage) {
      throw new SalesError('Add the PO file on the purchase order', 403);
    }
    return;
  }
  const allowed =
    (params.stage === 'QUERY' && params.access.queryManage) ||
    (params.stage === 'QUOTATION' && params.access.quotationManage) ||
    (params.stage === 'PURCHASE_ORDER' && params.access.purchaseOrdersManage);
  if (!allowed) throw new SalesError('Forbidden', 403);
}

export function assertUploadFile(file: File) {
  if (!ALLOWED_MIMES.has(file.type)) throw new SalesError('Upload a PDF, image, Word, or Excel file');
  if (file.size > 20 * 1024 * 1024) throw new SalesError('File size must not exceed 20 MB');
}

export async function getAttachmentForDownload(companyId: string, id: string, access: SalesAccess) {
  const attachment = await prisma.salesAttachment.findFirst({
    where: { id, companyId },
    include: { salesQuery: { select: { stage: true } } },
  });
  if (!attachment) throw new SalesError('File not found', 404);
  assertVisible(access, attachment.salesQuery.stage);
  return attachment;
}
