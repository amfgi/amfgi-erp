import { ymdFromInput } from '@/lib/hr/workDate';

export function parseRecordDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  try {
    return ymdFromInput(value.trim());
  } catch {
    return null;
  }
}

export function parseAdvanceAmount(value: unknown): string | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount.toFixed(2);
}

export function parseWarningNote(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const note = value.trim();
  if (!note || note.length > 2000) return null;
  return note;
}

export function parseAdvanceNote(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const note = value.trim();
  if (!note) return null;
  if (note.length > 2000) return null;
  return note;
}
