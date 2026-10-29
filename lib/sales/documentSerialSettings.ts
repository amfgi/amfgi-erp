import type { DocumentKind } from './format';

export const DOCUMENT_SERIAL_CONTROLS = [
  { kind: 'QR', key: 'query', label: 'Queries' },
  { kind: 'Q', key: 'quotation', label: 'Quotations' },
  { kind: 'PO', key: 'purchaseOrder', label: 'Purchase Orders' },
  { kind: 'J', key: 'job', label: 'Jobs' },
] as const;

export type DocumentSerialKey = (typeof DOCUMENT_SERIAL_CONTROLS)[number]['key'];

export type DocumentSerialSettings = Record<DocumentSerialKey, number>;

export const DEFAULT_DOCUMENT_SERIAL_SETTINGS: DocumentSerialSettings = {
  query: 1,
  quotation: 1,
  purchaseOrder: 1,
  job: 1,
};

export const MAX_DOCUMENT_SERIAL = 1_000_000_000;

export function normalizeDocumentSerial(input: unknown, fallback = 1): number {
  const num = typeof input === 'number' ? input : Number(String(input ?? '').trim());
  if (!Number.isInteger(num) || num < 1 || num > MAX_DOCUMENT_SERIAL) return fallback;
  return num;
}

export function normalizeDocumentSerialSettings(raw: unknown): DocumentSerialSettings {
  const fallback = DEFAULT_DOCUMENT_SERIAL_SETTINGS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...fallback };
  const record = raw as Record<string, unknown>;
  return {
    query: normalizeDocumentSerial(record.query, fallback.query),
    quotation: normalizeDocumentSerial(record.quotation, fallback.quotation),
    purchaseOrder: normalizeDocumentSerial(record.purchaseOrder, fallback.purchaseOrder),
    job: normalizeDocumentSerial(record.job, fallback.job),
  };
}

export function serialKeyForKind(kind: DocumentKind): DocumentSerialKey {
  const row = DOCUMENT_SERIAL_CONTROLS.find((item) => item.kind === kind);
  return row?.key ?? 'query';
}

export function startFromForKind(settings: DocumentSerialSettings, kind: DocumentKind): number {
  return settings[serialKeyForKind(kind)];
}

/** First serial to try. Existing numbers are never reused or rewritten. */
export function nextSerialFromHighest(highestExisting: number, startFrom: number): number {
  const start = normalizeDocumentSerial(startFrom, 1);
  const highest = Number.isInteger(highestExisting) && highestExisting > 0 ? highestExisting : 0;
  return Math.max(highest + 1, start);
}
