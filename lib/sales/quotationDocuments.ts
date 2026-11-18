import { Prisma, type SalesStage } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { canSeeStage, type SalesAccess } from '@/lib/sales/access';
import { queryNumberKey } from '@/lib/sales/format';
import { latestIdsByType } from '@/lib/sales/quotationDocumentList';
import { SalesError, assertUploadFile } from '@/lib/sales/service';
import { writeSalesWorkLog } from '@/lib/sales/workLog';
import { deleteFromDrive, uploadToDrive } from '@/lib/utils/googleDrive';
import { driveFileIdToOpenUrl } from '@/lib/utils/googleDriveUrl';
import { getEffectiveGoogleDriveRootFolderId } from '@/lib/utils/globalSettings';

const documentSelect = {
  id: true,
  typeId: true,
  fileName: true,
  mimeType: true,
  viewerUrl: true,
  note: true,
  carriedToPurchaseOrder: true,
  createdAt: true,
  type: { select: { name: true } },
} satisfies Prisma.SalesQuotationDocumentSelect;

function serializeDocument(row: {
  id: string;
  typeId: string;
  fileName: string;
  mimeType: string;
  viewerUrl: string;
  note: string | null;
  carriedToPurchaseOrder: boolean;
  createdAt: Date;
  type: { name: string };
}) {
  return {
    id: row.id,
    typeId: row.typeId,
    typeName: row.type.name,
    fileName: row.fileName,
    mimeType: row.mimeType,
    viewerUrl: row.viewerUrl,
    note: row.note,
    carriedToPurchaseOrder: row.carriedToPurchaseOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadQuery(companyId: string, id: string) {
  const record = await prisma.salesQuery.findFirst({
    where: { id, companyId },
    select: { id: true, queryNumber: true, stage: true, closure: true, jobId: true },
  });
  if (!record) throw new SalesError('Sales record not found', 404);
  return record;
}

function assertCanRead(access: SalesAccess, stage: SalesStage) {
  if (!canSeeStage(access, stage)) throw new SalesError('Forbidden', 403);
}

function recordDocumentLog(params: Parameters<typeof writeSalesWorkLog>[1]) {
  return writeSalesWorkLog(prisma, params).catch((error) => {
    console.error('[sales] quotation document log failed:', error);
  });
}

function safeDriveFileName(name: string) {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const safe = cleaned || 'document';
  return safe.length > 180 ? safe.slice(0, 180) : safe;
}

function assertCanChange(access: SalesAccess, stage: SalesStage, closure: string) {
  if (!access.quotationManage) throw new SalesError('Forbidden', 403);
  if (stage !== 'QUOTATION') throw new SalesError('Documents can only be changed on an open quotation', 422);
  if (closure !== 'OPEN') throw new SalesError('Reopen this record before changing documents', 422);
}

export async function listQuotationDocuments(params: { companyId: string; id: string; access: SalesAccess }) {
  const record = await loadQuery(params.companyId, params.id);
  assertCanRead(params.access, record.stage);
  const [types, documents] = await Promise.all([
    prisma.salesDocumentType.findMany({
      where: { companyId: params.companyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.salesQuotationDocument.findMany({
      where: { companyId: params.companyId, salesQueryId: record.id },
      select: documentSelect,
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return { types, documents: documents.map(serializeDocument) };
}

export async function listCarriedQuotationDocumentsForJob(companyId: string, jobId: string) {
  const record = await prisma.salesQuery.findFirst({
    where: { companyId, jobId },
    select: { id: true },
  });
  if (!record) return { linked: false, documents: [] };
  const documents = await prisma.salesQuotationDocument.findMany({
    where: { companyId, salesQueryId: record.id, carriedToPurchaseOrder: true },
    select: documentSelect,
    orderBy: { createdAt: 'desc' },
  });
  return { linked: true, documents: documents.map(serializeDocument) };
}

async function resolveType(companyId: string, typeId: string | null, newTypeName: string | null) {
  const name = newTypeName?.trim() ?? '';
  if (name) {
    if (name.length > 80) throw new SalesError('Document type name must be 80 characters or less');
    const nameKey = queryNumberKey(name);
    const existing = await prisma.salesDocumentType.findFirst({
      where: { companyId, nameKey },
      select: { id: true, name: true },
    });
    if (existing) return existing;
    try {
      return await prisma.salesDocumentType.create({
        data: { companyId, name, nameKey },
        select: { id: true, name: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await prisma.salesDocumentType.findFirst({
          where: { companyId, nameKey },
          select: { id: true, name: true },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }
  if (!typeId) throw new SalesError('Select a document type');
  const type = await prisma.salesDocumentType.findFirst({
    where: { id: typeId, companyId },
    select: { id: true, name: true },
  });
  if (!type) throw new SalesError('Document type not found', 404);
  return type;
}

export async function createQuotationDocumentType(params: {
  companyId: string;
  id: string;
  access: SalesAccess;
  name: string;
}) {
  const record = await loadQuery(params.companyId, params.id);
  assertCanChange(params.access, record.stage, record.closure);
  return resolveType(params.companyId, null, params.name);
}

export async function removeQuotationDocumentType(params: {
  companyId: string;
  id: string;
  access: SalesAccess;
  typeId: string;
}) {
  const record = await loadQuery(params.companyId, params.id);
  assertCanChange(params.access, record.stage, record.closure);
  const type = await prisma.salesDocumentType.findFirst({
    where: { id: params.typeId, companyId: params.companyId },
    select: { id: true },
  });
  if (!type) throw new SalesError('Document type not found', 404);
  const used = await prisma.salesQuotationDocument.count({
    where: { companyId: params.companyId, typeId: type.id },
  });
  if (used > 0) throw new SalesError('Remove the files that use this type first', 422);
  await prisma.salesDocumentType.delete({ where: { id: type.id } });
  return { id: type.id };
}

export async function addQuotationDocument(params: {
  companyId: string;
  id: string;
  access: SalesAccess;
  actorId: string;
  file: File;
  typeId: string | null;
  newTypeName: string | null;
  note: string | null;
}) {
  const record = await loadQuery(params.companyId, params.id);
  assertCanChange(params.access, record.stage, record.closure);
  const mimeType = assertUploadFile(params.file);
  const fileName = safeDriveFileName(params.file.name);
  const note = params.note?.trim() || null;
  if (note && note.length > 500) throw new SalesError('Note must be 500 characters or less');
  const type = await resolveType(params.companyId, params.typeId, params.newTypeName);
  const folderId = await getEffectiveGoogleDriveRootFolderId();
  if (!folderId) throw new SalesError('Google Drive folder not configured');

  const buffer = Buffer.from(await params.file.arrayBuffer());
  let uploaded: Awaited<ReturnType<typeof uploadToDrive>>;
  try {
    uploaded = await uploadToDrive(buffer, fileName, mimeType, {
      companyId: params.companyId,
      rootFolderId: folderId,
      folderPath: [
        { key: 'drive-folder:sales-root', name: 'Sales' },
        { key: `drive-folder:sales-query:${record.id}`, name: `${record.queryNumber} - ${record.id}` },
        { key: `drive-folder:sales-query:${record.id}:quotation-documents`, name: 'Quotation documents' },
      ],
    });
  } catch (error) {
    throw new SalesError(error instanceof Error ? error.message : 'Could not upload the file to Google Drive', 502);
  }
  if (!uploaded.id) throw new SalesError('Google Drive did not return a file', 502);

  let created;
  try {
    created = await prisma.salesQuotationDocument.create({
      data: {
        companyId: params.companyId,
        salesQueryId: record.id,
        typeId: type.id,
        fileName,
        mimeType,
        driveFileId: uploaded.id,
        viewerUrl: driveFileIdToOpenUrl(uploaded.id) ?? uploaded.viewerUrl,
        note,
        uploadedById: params.actorId,
      },
      select: documentSelect,
    });
  } catch (error) {
    await deleteFromDrive(uploaded.id, params.companyId).catch(() => undefined);
    throw error;
  }
  await recordDocumentLog({
    companyId: params.companyId,
    salesQueryId: record.id,
    actorId: params.actorId,
    action: 'DOCUMENT_UPLOADED',
    detail: `${type.name}: ${fileName}`,
  });
  return serializeDocument(created);
}

async function loadOwnedDocument(companyId: string, id: string) {
  const document = await prisma.salesQuotationDocument.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      salesQueryId: true,
      fileName: true,
      driveFileId: true,
      carriedToPurchaseOrder: true,
      type: { select: { name: true } },
      salesQuery: { select: { stage: true, closure: true } },
    },
  });
  if (!document) throw new SalesError('Document not found', 404);
  return document;
}

export async function updateQuotationDocumentNote(params: {
  companyId: string;
  id: string;
  access: SalesAccess;
  actorId: string;
  note: string | null;
}) {
  const document = await loadOwnedDocument(params.companyId, params.id);
  assertCanChange(params.access, document.salesQuery.stage, document.salesQuery.closure);
  if (document.carriedToPurchaseOrder) throw new SalesError('This document is locked on the purchase order', 422);
  const note = params.note?.trim() || null;
  if (note && note.length > 500) throw new SalesError('Note must be 500 characters or less');
  const saved = await prisma.salesQuotationDocument.updateMany({
    where: { id: document.id, companyId: params.companyId, carriedToPurchaseOrder: false },
    data: { note },
  });
  if (saved.count !== 1) throw new SalesError('This document is locked on the purchase order', 422);
  const updated = await prisma.salesQuotationDocument.findFirst({
    where: { id: document.id, companyId: params.companyId },
    select: documentSelect,
  });
  if (!updated) throw new SalesError('Document not found', 404);
  await recordDocumentLog({
    companyId: params.companyId,
    salesQueryId: document.salesQueryId,
    actorId: params.actorId,
    action: 'DOCUMENT_NOTE',
    detail: document.fileName,
  });
  return serializeDocument(updated);
}

export async function removeQuotationDocument(params: {
  companyId: string;
  id: string;
  access: SalesAccess;
  actorId: string;
}) {
  const document = await loadOwnedDocument(params.companyId, params.id);
  assertCanChange(params.access, document.salesQuery.stage, document.salesQuery.closure);
  if (document.carriedToPurchaseOrder) throw new SalesError('This document is locked on the purchase order', 422);
  const removed = await prisma.salesQuotationDocument.deleteMany({
    where: { id: document.id, companyId: params.companyId, carriedToPurchaseOrder: false },
  });
  if (removed.count !== 1) {
    const stillThere = await prisma.salesQuotationDocument.findFirst({
      where: { id: document.id, companyId: params.companyId },
      select: { id: true },
    });
    throw new SalesError(
      stillThere ? 'This document is locked on the purchase order' : 'Document not found',
      stillThere ? 422 : 404,
    );
  }
  await deleteFromDrive(document.driveFileId, params.companyId).catch((error) => {
    console.error('[drive] quotation document delete failed:', error);
  });
  await recordDocumentLog({
    companyId: params.companyId,
    salesQueryId: document.salesQueryId,
    actorId: params.actorId,
    action: 'DOCUMENT_REMOVED',
    detail: `${document.type.name}: ${document.fileName}`,
  });
  return { id: document.id };
}

export async function getQuotationDocumentForDownload(companyId: string, id: string, access: SalesAccess) {
  const document = await prisma.salesQuotationDocument.findFirst({
    where: { id, companyId },
    select: {
      fileName: true,
      mimeType: true,
      driveFileId: true,
      salesQuery: { select: { stage: true } },
    },
  });
  if (!document) throw new SalesError('Document not found', 404);
  assertCanRead(access, document.salesQuery.stage);
  return document;
}

export async function getCarriedQuotationDocumentForJobDownload(companyId: string, id: string) {
  const document = await prisma.salesQuotationDocument.findFirst({
    where: { id, companyId, carriedToPurchaseOrder: true, salesQuery: { jobId: { not: null } } },
    select: { fileName: true, mimeType: true, driveFileId: true },
  });
  if (!document) throw new SalesError('Document not found', 404);
  return document;
}
