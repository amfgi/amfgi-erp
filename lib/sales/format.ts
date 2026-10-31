export function phoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function queryNumberKey(value: string): string {
  return value.trim().toLowerCase();
}

export function salesYearCode(date = new Date()): string {
  return String(date.getFullYear()).slice(-2);
}

export type DocumentKind = 'QR' | 'Q' | 'PO' | 'J';

export function formatSerial(serial: number): string {
  return serial <= 9999 ? String(serial).padStart(4, '0') : String(serial);
}

export function formatDocumentNumber(prefix: string, year: string, serial: number): string {
  return `${prefix}${year}-${formatSerial(serial)}`;
}

export function parseDocumentSerial(prefix: string, year: string, value: string): number | null {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = value.trim().match(new RegExp(`^${escaped}${year}-(\\d+)$`, 'i'));
  if (!match) return null;
  const serial = Number(match[1]);
  if (!Number.isInteger(serial) || serial < 1) return null;
  return serial;
}

export function formatQuotationNumber(base: string | null | undefined, revision: number): string {
  if (!base) return '';
  if (revision <= 0) return base;
  return `${base}-R${revision}`;
}

export function dateInputValue(value?: string | Date | null): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (Number.isNaN(value.getTime())) return '';
  return value.toISOString().slice(0, 10);
}

export function stageLabel(stage: 'QUERY' | 'QUOTATION' | 'PURCHASE_ORDER'): string {
  if (stage === 'QUOTATION') return 'Quotation';
  if (stage === 'PURCHASE_ORDER') return 'Purchase order';
  return 'Query';
}
