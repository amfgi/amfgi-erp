import type { DocumentKind } from './format';

export const DOCUMENT_SERIAL_CONTROLS = [
  { kind: 'QR', key: 'query', label: 'Queries' },
  { kind: 'Q', key: 'quotation', label: 'Quotations' },
  { kind: 'PO', key: 'purchaseOrder', label: 'Purchase Orders' },
  { kind: 'J', key: 'job', label: 'Jobs' },
] as const;

export type DocumentSerialKey = (typeof DOCUMENT_SERIAL_CONTROLS)[number]['key'];

export type DocumentSerialPrefixes = Record<DocumentSerialKey, string>;

export type DocumentSerialSettings = {
  query: number;
  quotation: number;
  purchaseOrder: number;
  job: number;
  prefixes: DocumentSerialPrefixes;
};

export const DEFAULT_DOCUMENT_SERIAL_PREFIXES: DocumentSerialPrefixes = {
  query: 'QR',
  quotation: 'Q',
  purchaseOrder: 'PO',
  job: 'J',
};

export const DEFAULT_DOCUMENT_SERIAL_SETTINGS: DocumentSerialSettings = {
  query: 1,
  quotation: 1,
  purchaseOrder: 1,
  job: 1,
  prefixes: { ...DEFAULT_DOCUMENT_SERIAL_PREFIXES },
};

export const MAX_DOCUMENT_SERIAL = 1_000_000_000;
export const MAX_DOCUMENT_PREFIX_LENGTH = 6;

export function normalizeDocumentSerial(input: unknown, fallback = 1): number {
  const num = typeof input === 'number' ? input : Number(String(input ?? '').trim());
  if (!Number.isInteger(num) || num < 1 || num > MAX_DOCUMENT_SERIAL) return fallback;
  return num;
}

export function normalizeDocumentPrefix(input: unknown, fallback: string): string {
  const raw = String(input ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(raw)) return fallback;
  return raw;
}

function readStart(value: unknown, fallback: number): number {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'startFrom' in value) {
    return normalizeDocumentSerial((value as { startFrom?: unknown }).startFrom, fallback);
  }
  return normalizeDocumentSerial(value, fallback);
}

function readPrefix(value: unknown, explicit: unknown, fallback: string): string {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'prefix' in value) {
    return normalizeDocumentPrefix((value as { prefix?: unknown }).prefix, normalizeDocumentPrefix(explicit, fallback));
  }
  return normalizeDocumentPrefix(explicit, fallback);
}

function distinctPrefixes(prefixes: DocumentSerialPrefixes): DocumentSerialPrefixes {
  const next = { ...prefixes };
  const seen = new Set<string>();
  for (const control of DOCUMENT_SERIAL_CONTROLS) {
    const key = control.key;
    if (!seen.has(next[key])) {
      seen.add(next[key]);
      continue;
    }
    const fallback = DEFAULT_DOCUMENT_SERIAL_PREFIXES[key];
    next[key] = seen.has(fallback) ? control.kind : fallback;
    seen.add(next[key]);
  }
  return next;
}

export function normalizeDocumentSerialSettings(raw: unknown): DocumentSerialSettings {
  const fallback = DEFAULT_DOCUMENT_SERIAL_SETTINGS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...fallback, prefixes: { ...fallback.prefixes } };
  }
  const record = raw as Record<string, unknown>;
  const prefixRecord = record.prefixes && typeof record.prefixes === 'object' && !Array.isArray(record.prefixes)
    ? record.prefixes as Record<string, unknown>
    : {};
  return {
    query: readStart(record.query, fallback.query),
    quotation: readStart(record.quotation, fallback.quotation),
    purchaseOrder: readStart(record.purchaseOrder, fallback.purchaseOrder),
    job: readStart(record.job, fallback.job),
    prefixes: distinctPrefixes({
      query: readPrefix(record.query, prefixRecord.query, fallback.prefixes.query),
      quotation: readPrefix(record.quotation, prefixRecord.quotation, fallback.prefixes.quotation),
      purchaseOrder: readPrefix(record.purchaseOrder, prefixRecord.purchaseOrder, fallback.prefixes.purchaseOrder),
      job: readPrefix(record.job, prefixRecord.job, fallback.prefixes.job),
    }),
  };
}

export function serialKeyForKind(kind: DocumentKind): DocumentSerialKey {
  const row = DOCUMENT_SERIAL_CONTROLS.find((item) => item.kind === kind);
  return row?.key ?? 'query';
}

export function startFromForKind(settings: DocumentSerialSettings, kind: DocumentKind): number {
  return settings[serialKeyForKind(kind)];
}

export function prefixForKind(settings: DocumentSerialSettings, kind: DocumentKind): string {
  return settings.prefixes[serialKeyForKind(kind)];
}

/** First serial to try. Existing numbers are never reused or rewritten. */
export function nextSerialFromHighest(highestExisting: number, startFrom: number): number {
  const start = normalizeDocumentSerial(startFrom, 1);
  const highest = Number.isInteger(highestExisting) && highestExisting > 0 ? highestExisting : 0;
  return Math.max(highest + 1, start);
}
