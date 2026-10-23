import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';

import { plainText, sanitizeRichText } from './quotationDocument';
import { SalesError } from './service';

export type SavedTermsRow = { label: string; value: string };

const NAME_LIMIT = 80;
const ROW_LIMIT = 40;

export function termsNameKey(name: string) {
  return name.trim().toLowerCase();
}

export function sanitizeTermsRows(value: unknown): SavedTermsRow[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, ROW_LIMIT).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as { label?: unknown; value?: unknown };
    const label = sanitizeRichText(typeof row.label === 'string' ? row.label : '').slice(0, 500);
    const text = sanitizeRichText(typeof row.value === 'string' ? row.value : '');
    if (!plainText(label) && !plainText(text)) return [];
    return [{ label, value: text }];
  });
}

function alreadySaved(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2002') return true;
  const detail = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
  return error.code === 'P2010' && /23505|duplicate key/i.test(detail);
}

export async function listTermsTemplates(companyId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; rows: unknown }>>`
    SELECT "id", "name", "rows"
    FROM "QuotationTermsTemplate"
    WHERE "companyId" = ${companyId}
    ORDER BY "name" ASC
  `;
  return rows.map((row) => ({ id: row.id, name: row.name, rows: sanitizeTermsRows(row.rows) }));
}

export async function createTermsTemplate(companyId: string, name: string, rows: unknown) {
  const trimmed = name.trim().slice(0, NAME_LIMIT);
  const nameKey = termsNameKey(trimmed);
  if (!nameKey) throw new SalesError('Enter a name');
  const savedRows = sanitizeTermsRows(rows);
  if (!savedRows.length) throw new SalesError('Add a term before saving');
  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "QuotationTermsTemplate"
    WHERE "companyId" = ${companyId} AND "nameKey" = ${nameKey}
    LIMIT 1
  `;
  if (existing.length) throw new SalesError('This name is already saved');
  try {
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "QuotationTermsTemplate" ("id", "companyId", "name", "nameKey", "rows", "createdAt")
      VALUES (${id}, ${companyId}, ${trimmed}, ${nameKey}, CAST(${JSON.stringify(savedRows)} AS jsonb), NOW())
    `;
    return { id, name: trimmed };
  } catch (error) {
    if (alreadySaved(error)) throw new SalesError('This name is already saved');
    throw error;
  }
}
