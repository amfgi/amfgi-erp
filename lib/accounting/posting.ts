import { parseMoney } from '@/lib/accounting/rules';

export type JournalLineInput = {
  accountId?: string | null;
  debit?: unknown;
  credit?: unknown;
  memo?: string | null;
  partyName?: string | null;
  vatItem?: string | null;
  billable?: boolean;
  jobLabel?: string | null;
};

export type PreparedJournalLine = {
  accountId: string;
  debitFils: number;
  creditFils: number;
  memo: string | null;
  partyName: string | null;
  vatItem: string | null;
  billable: boolean;
  jobLabel: string | null;
};

function cleanText(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function prepareJournalLines(
  lines: JournalLineInput[],
): { ok: true; lines: PreparedJournalLine[]; debitFils: number; creditFils: number } | { ok: false; error: string } {
  const prepared: PreparedJournalLine[] = [];
  for (const line of lines) {
    const debit = parseMoney(line.debit);
    if (!debit.ok) return debit;
    const credit = parseMoney(line.credit);
    if (!credit.ok) return credit;
    const accountId = line.accountId?.trim() ?? '';
    if (debit.fils === 0 && credit.fils === 0) continue;
    if (!accountId) return { ok: false, error: 'Each amount needs an account.' };
    if (debit.fils > 0 && credit.fils > 0) {
      return { ok: false, error: 'A line can have a debit or a credit, not both.' };
    }
    prepared.push({
      accountId,
      debitFils: debit.fils,
      creditFils: credit.fils,
      memo: cleanText(line.memo, 500),
      partyName: cleanText(line.partyName, 200),
      vatItem: cleanText(line.vatItem, 40),
      billable: Boolean(line.billable),
      jobLabel: cleanText(line.jobLabel, 200),
    });
  }

  if (prepared.length < 2) {
    return { ok: false, error: 'Enter at least two lines.' };
  }
  const debitFils = prepared.reduce((sum, line) => sum + line.debitFils, 0);
  const creditFils = prepared.reduce((sum, line) => sum + line.creditFils, 0);
  if (debitFils === 0 || creditFils === 0 || debitFils !== creditFils) {
    return { ok: false, error: 'Debit and credit totals must match and be greater than zero.' };
  }
  return { ok: true, lines: prepared, debitFils, creditFils };
}
