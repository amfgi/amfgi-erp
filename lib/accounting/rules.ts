import type { AccountNormalSide } from '@prisma/client';

export function oppositeSide(side: AccountNormalSide): AccountNormalSide {
  return side === 'DEBIT' ? 'CREDIT' : 'DEBIT';
}

export function isContraType(normalSide: AccountNormalSide, increaseSide: AccountNormalSide): boolean {
  return increaseSide !== normalSide;
}

export function contraExplanation(groupName: string, normalSide: AccountNormalSide, increaseSide: AccountNormalSide): string | null {
  if (!isContraType(normalSide, increaseSide)) return null;
  const label = groupName.trim() || 'statement group';
  const normal = normalSide === 'DEBIT' ? 'Debit' : 'Credit';
  const actual = increaseSide === 'DEBIT' ? 'Debit' : 'Credit';
  return `This is a contra ${label.toLowerCase()} account. A normal ${label.toLowerCase()} increases on ${normal}. This type increases on ${actual}.`;
}

export type MoneyParse = { ok: true; fils: number } | { ok: false; error: string };

/** Positive money with at most 2 decimal places. Blank is zero. Negatives are rejected. */
export function parseMoney(input: unknown): MoneyParse {
  if (input == null) return { ok: true, fils: 0 };
  const raw = typeof input === 'number' ? String(input) : String(input).trim();
  if (raw === '') return { ok: true, fils: 0 };
  if (raw.startsWith('-')) {
    return { ok: false, error: 'Amounts cannot be negative. Enter the other column instead.' };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { ok: false, error: 'Use a number with up to 2 decimal places.' };
  }
  const [whole, frac = ''] = raw.split('.');
  const fils = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(fils)) return { ok: false, error: 'Amount is too large.' };
  return { ok: true, fils };
}

export function filsToDecimalString(fils: number): string {
  const sign = fils < 0 ? '-' : '';
  const abs = Math.abs(fils);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

export function formatMoney(fils: number): string {
  const negative = fils < 0;
  const abs = Math.abs(fils);
  const whole = Math.floor(abs / 100).toLocaleString('en-AE');
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}
