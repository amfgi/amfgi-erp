import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';

import { quotationTemplateDocument, quotationTemplateKey, readQuotationDocument } from './quotationDocument';
import { SalesError } from './service';
import { termsNameKey } from './termsTemplates';

const NAME_LIMIT = 80;

function alreadySaved(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2002') return true;
  const detail = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
  return error.code === 'P2010' && /23505|duplicate key/i.test(detail);
}

function cleanName(name: string) {
  const trimmed = name.trim().slice(0, NAME_LIMIT);
  const nameKey = termsNameKey(trimmed);
  if (!nameKey) throw new SalesError('Enter a name');
  return { trimmed, nameKey };
}

export async function getQuotationTemplate(companyId: string, id: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; document: unknown }>>`
    SELECT "id", "name", "document"
    FROM "QuotationTemplate"
    WHERE "id" = ${id} AND "companyId" = ${companyId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new SalesError('Template not found', 404);
  const document = readQuotationDocument(row.document);
  if (!document) throw new SalesError('This template has no quotation document');
  return { id: row.id, name: row.name, document };
}

export async function listQuotationTemplates(companyId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; document: unknown }>>`
    SELECT "id", "name", "document"
    FROM "QuotationTemplate"
    WHERE "companyId" = ${companyId}
    ORDER BY "name" ASC
  `;
  return rows.flatMap((row) => {
    const document = readQuotationDocument(row.document);
    if (!document) return [];
    return [{ id: row.id, name: row.name, key: quotationTemplateKey(document) }];
  });
}

export async function createQuotationTemplate(companyId: string, name: string, document: unknown) {
  const { trimmed, nameKey } = cleanName(name);
  const saved = readQuotationDocument(document);
  if (!saved) throw new SalesError('The quotation document is incomplete');
  const template = quotationTemplateDocument(saved);
  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "QuotationTemplate"
    WHERE "companyId" = ${companyId} AND "nameKey" = ${nameKey}
    LIMIT 1
  `;
  if (existing.length) throw new SalesError('This name is already saved');
  try {
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "QuotationTemplate" ("id", "companyId", "name", "nameKey", "document", "createdAt")
      VALUES (${id}, ${companyId}, ${trimmed}, ${nameKey}, CAST(${JSON.stringify(template)} AS jsonb), NOW())
    `;
    return { id, name: trimmed };
  } catch (error) {
    if (alreadySaved(error)) throw new SalesError('This name is already saved');
    throw error;
  }
}
