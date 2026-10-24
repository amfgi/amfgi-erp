import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';

import { plainText, sanitizeRichText } from './quotationDocument';
import { SalesError } from './service';

export type CustomSectionContent = {
  name: string;
  body: string;
  minHeightMm: number;
  widthPercent: number;
};

const NAME_LIMIT = 80;

export function customSectionNameKey(name: string) {
  return name.trim().toLowerCase();
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function sanitizeCustomSection(value: unknown): CustomSectionContent | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { name?: unknown; body?: unknown; minHeightMm?: unknown; widthPercent?: unknown };
  const name = sanitizeRichText(typeof record.name === 'string' ? record.name : '').slice(0, 500);
  const body = sanitizeRichText(typeof record.body === 'string' ? record.body : '');
  if (!plainText(name) && !plainText(body)) return null;
  return {
    name,
    body,
    minHeightMm: clamp(record.minHeightMm, 24, 160, 36),
    widthPercent: clamp(record.widthPercent, 45, 100, 100),
  };
}

function alreadySaved(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2002') return true;
  const detail = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
  return error.code === 'P2010' && /23505|duplicate key/i.test(detail);
}

export async function listCustomSections(companyId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; content: unknown }>>`
    SELECT "id", "name", "content"
    FROM "QuotationCustomSection"
    WHERE "companyId" = ${companyId}
    ORDER BY "name" ASC
  `;
  return rows.flatMap((row) => {
    const content = sanitizeCustomSection(row.content);
    return content ? [{ id: row.id, name: row.name, content }] : [];
  });
}

function cleanName(name: string) {
  const trimmed = name.trim().slice(0, NAME_LIMIT);
  const nameKey = customSectionNameKey(trimmed);
  if (!nameKey) throw new SalesError('Enter a name');
  return { trimmed, nameKey };
}

export async function createCustomSection(companyId: string, name: string, content: unknown) {
  const { trimmed, nameKey } = cleanName(name);
  const saved = sanitizeCustomSection(content);
  if (!saved) throw new SalesError('Write a heading or some text before saving');
  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "QuotationCustomSection"
    WHERE "companyId" = ${companyId} AND "nameKey" = ${nameKey}
    LIMIT 1
  `;
  if (existing.length) throw new SalesError('This name is already saved');
  try {
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "QuotationCustomSection" ("id", "companyId", "name", "nameKey", "content", "createdAt")
      VALUES (${id}, ${companyId}, ${trimmed}, ${nameKey}, CAST(${JSON.stringify(saved)} AS jsonb), NOW())
    `;
    return { id, name: trimmed };
  } catch (error) {
    if (alreadySaved(error)) throw new SalesError('This name is already saved');
    throw error;
  }
}

export async function renameCustomSection(companyId: string, id: string, name: string) {
  const { trimmed, nameKey } = cleanName(name);
  const current = await prisma.$queryRaw<Array<{ id: string; name: string; content: unknown }>>`
    SELECT "id", "name", "content"
    FROM "QuotationCustomSection"
    WHERE "id" = ${id} AND "companyId" = ${companyId}
    LIMIT 1
  `;
  if (!current.length) throw new SalesError('Saved section not found', 404);
  const clash = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "QuotationCustomSection"
    WHERE "companyId" = ${companyId} AND "nameKey" = ${nameKey} AND "id" <> ${id}
    LIMIT 1
  `;
  if (clash.length) throw new SalesError('This name is already saved');
  const content = sanitizeCustomSection(current[0].content);
  const headingMatches = Boolean(
    content && customSectionNameKey(plainText(content.name)) === customSectionNameKey(current[0].name),
  );
  if (content && headingMatches) content.name = sanitizeRichText(trimmed).slice(0, 500);
  const nextContent = content && headingMatches ? content : current[0].content;
  try {
    const updated = await prisma.$executeRaw`
      UPDATE "QuotationCustomSection"
      SET "name" = ${trimmed},
          "nameKey" = ${nameKey},
          "content" = CAST(${JSON.stringify(nextContent)} AS jsonb)
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

export async function deleteCustomSection(companyId: string, id: string) {
  const deleted = await prisma.$executeRaw`
    DELETE FROM "QuotationCustomSection"
    WHERE "id" = ${id} AND "companyId" = ${companyId}
  `;
  if (Number(deleted) < 1) throw new SalesError('Saved section not found', 404);
  return { id };
}
