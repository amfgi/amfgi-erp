import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';

import { plainText, sanitizeRichText } from './quotationDocument';
import { SalesError } from './service';
import { sanitizeTermsRows, termsNameKey, type SavedTermsRow } from './termsTemplates';

export type SectionPresetKind = 'scope' | 'specification';

export type SectionPreset =
  | { id: string; name: string; kind: 'scope'; body: string }
  | { id: string; name: string; kind: 'specification'; rows: SavedTermsRow[] };

const NAME_LIMIT = 80;

export function readSectionPresetKind(value: unknown): SectionPresetKind {
  if (value === 'scope' || value === 'specification') return value;
  throw new SalesError('Choose scope or specification');
}

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

function scopeBody(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as { body?: unknown }) : {};
  const body = sanitizeRichText(typeof record.body === 'string' ? record.body : '').slice(0, 8000);
  if (!plainText(body)) throw new SalesError('Write the scope before saving');
  return { body };
}

function specificationRows(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as { rows?: unknown }) : {};
  const rows = sanitizeTermsRows(record.rows);
  if (!rows.length) throw new SalesError('Add a line before saving');
  return { rows };
}

function present(row: { id: string; name: string; kind: string; content: unknown }): SectionPreset | null {
  if (row.kind === 'scope') {
    if (!row.content || typeof row.content !== 'object') return null;
    const body = sanitizeRichText(typeof (row.content as { body?: unknown }).body === 'string' ? (row.content as { body: string }).body : '');
    if (!plainText(body)) return null;
    return { id: row.id, name: row.name, kind: 'scope', body };
  }
  if (row.kind === 'specification') {
    const rows = sanitizeTermsRows(row.content && typeof row.content === 'object' ? (row.content as { rows?: unknown }).rows : []);
    if (!rows.length) return null;
    return { id: row.id, name: row.name, kind: 'specification', rows };
  }
  return null;
}

export async function listSectionPresets(companyId: string, kindValue: unknown) {
  const kind = readSectionPresetKind(kindValue);
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; kind: string; content: unknown }>>`
    SELECT "id", "name", "kind", "content"
    FROM "QuotationSectionPreset"
    WHERE "companyId" = ${companyId} AND "kind" = ${kind}
    ORDER BY "name" ASC
  `;
  return rows.flatMap((row) => {
    const preset = present(row);
    return preset ? [preset] : [];
  });
}

export async function createSectionPreset(companyId: string, kindValue: unknown, name: string, payload: unknown) {
  const kind = readSectionPresetKind(kindValue);
  const { trimmed, nameKey } = cleanName(name);
  const content = kind === 'scope' ? scopeBody(payload) : specificationRows(payload);
  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "QuotationSectionPreset"
    WHERE "companyId" = ${companyId} AND "kind" = ${kind} AND "nameKey" = ${nameKey}
    LIMIT 1
  `;
  if (existing.length) throw new SalesError('This name is already saved');
  try {
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "QuotationSectionPreset" ("id", "companyId", "kind", "name", "nameKey", "content", "createdAt")
      VALUES (${id}, ${companyId}, ${kind}, ${trimmed}, ${nameKey}, CAST(${JSON.stringify(content)} AS jsonb), NOW())
    `;
    return { id, name: trimmed };
  } catch (error) {
    if (alreadySaved(error)) throw new SalesError('This name is already saved');
    throw error;
  }
}

export async function renameSectionPreset(companyId: string, id: string, name: string) {
  const { trimmed, nameKey } = cleanName(name);
  const current = await prisma.$queryRaw<Array<{ id: string; kind: string }>>`
    SELECT "id", "kind"
    FROM "QuotationSectionPreset"
    WHERE "id" = ${id} AND "companyId" = ${companyId}
    LIMIT 1
  `;
  if (!current.length) throw new SalesError('Saved section not found', 404);
  const clash = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "QuotationSectionPreset"
    WHERE "companyId" = ${companyId} AND "kind" = ${current[0].kind} AND "nameKey" = ${nameKey} AND "id" <> ${id}
    LIMIT 1
  `;
  if (clash.length) throw new SalesError('This name is already saved');
  try {
    const updated = await prisma.$executeRaw`
      UPDATE "QuotationSectionPreset"
      SET "name" = ${trimmed}, "nameKey" = ${nameKey}
      WHERE "id" = ${id} AND "companyId" = ${companyId}
    `;
    if (Number(updated) < 1) throw new SalesError('Saved section not found', 404);
    return { id, name: trimmed };
  } catch (error) {
    if (error instanceof SalesError) throw error;
    if (alreadySaved(error)) throw new SalesError('This name is already saved');
    throw error;
  }
}

export async function deleteSectionPreset(companyId: string, id: string) {
  const deleted = await prisma.$executeRaw`
    DELETE FROM "QuotationSectionPreset"
    WHERE "id" = ${id} AND "companyId" = ${companyId}
  `;
  if (Number(deleted) < 1) throw new SalesError('Saved section not found', 404);
  return { id };
}
