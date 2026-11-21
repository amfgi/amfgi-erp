import { centsToMoney, moneyToCents } from '@/lib/hr/payroll/calendar';

export const FINE_INSTALLMENT_MAX_MONTHS = 12;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type FineRecoveryInput =
  | { mode: 'month'; month: string }
  | { mode: 'range'; from: string; to: string };

export type FineInstallmentPlan = {
  payrollMonth: string;
  amount: number;
  sequence: number;
};

export function isPayrollMonth(value: string): boolean {
  return MONTH.test(value);
}

export function payrollMonthOfFineDate(fineDate: string): string | null {
  const month = fineDate.slice(0, 7);
  return isPayrollMonth(month) ? month : null;
}

export function shiftPayrollMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  const nextYear = shifted.getUTCFullYear();
  const nextMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
}

/** Inclusive month list. Null when the range is inverted or longer than the safety cap. */
export function listPayrollMonths(from: string, to: string): string[] | null {
  if (!isPayrollMonth(from) || !isPayrollMonth(to) || from > to) return null;
  const months: string[] = [];
  let cursor = from;
  for (let guard = 0; guard < 36 && cursor <= to; guard += 1) {
    months.push(cursor);
    cursor = shiftPayrollMonth(cursor, 1);
  }
  if (cursor <= to) return null;
  return months;
}

/**
 * Split a fine into equal fils. Earlier months stay equal.
 * The last month takes any leftover fils so the parts add up to the total.
 * Returns null when a month would receive nothing.
 */
export function splitFineAmount(total: number, monthCount: number): number[] | null {
  if (!Number.isFinite(total) || !Number.isInteger(monthCount) || monthCount < 1) return null;
  const cents = moneyToCents(total);
  if (cents <= 0 || monthCount > cents) return null;
  const base = Math.floor(cents / monthCount);
  const remainder = cents - base * monthCount;
  const parts: number[] = [];
  for (let index = 0; index < monthCount; index += 1) {
    const part = index === monthCount - 1 ? base + remainder : base;
    if (part <= 0) return null;
    parts.push(centsToMoney(part));
  }
  return parts;
}

export function formatPayrollMonthLabel(month: string): string {
  const [yearText, monthText] = month.split('-');
  const monthIndex = Number(monthText) - 1;
  const name = MONTH_NAMES[monthIndex] ?? month;
  return `${name} ${yearText}`;
}

export function formatDeductionSpan(months: string[]): string {
  if (months.length === 0) return '';
  const sorted = [...months].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === last) return formatPayrollMonthLabel(first);
  const [firstYear, firstMonth] = first.split('-');
  const [lastYear, lastMonth] = last.split('-');
  if (firstYear === lastYear) {
    const startName = MONTH_NAMES[Number(firstMonth) - 1] ?? firstMonth;
    const endName = MONTH_NAMES[Number(lastMonth) - 1] ?? lastMonth;
    return `${startName}–${endName} ${firstYear}`;
  }
  return `${formatPayrollMonthLabel(first)}–${formatPayrollMonthLabel(last)}`;
}

export function fineHistoryDescription(description: string, payrollMonths: string[]): string {
  if (payrollMonths.length === 0) return description;
  return `${description} (deducted ${formatDeductionSpan(payrollMonths)})`;
}

export function payrollInstallmentDescription(description: string, sequence: number, count: number): string {
  if (count <= 1) return description;
  return `${description} (${sequence}/${count})`;
}

export function parseFineRecovery(value: unknown): { recovery: FineRecoveryInput | null } | { error: string } {
  if (value == null) return { recovery: null };
  if (typeof value !== 'object') return { error: 'Choose how to deduct this fine' };
  const body = value as { mode?: unknown; month?: unknown; from?: unknown; to?: unknown };
  if (body.mode === 'month') {
    if (typeof body.month !== 'string' || !isPayrollMonth(body.month)) return { error: 'Choose a month' };
    return { recovery: { mode: 'month', month: body.month } };
  }
  if (body.mode === 'range') {
    if (typeof body.from !== 'string' || !isPayrollMonth(body.from) || typeof body.to !== 'string' || !isPayrollMonth(body.to)) {
      return { error: 'Choose a start and end month' };
    }
    return { recovery: { mode: 'range', from: body.from, to: body.to } };
  }
  return { error: 'Choose how to deduct this fine' };
}

export function planFineInstallments(input: {
  fineDate: string;
  amount: number;
  recovery: FineRecoveryInput | null;
}): { installments: FineInstallmentPlan[] } | { error: string } {
  const fineMonth = payrollMonthOfFineDate(input.fineDate);
  if (!fineMonth) return { error: 'Fine date is invalid' };
  if (!Number.isFinite(input.amount) || moneyToCents(input.amount) <= 0) {
    return { error: 'Enter a fine amount greater than 0' };
  }

  let months: string[];
  if (input.recovery == null || (input.recovery.mode === 'month' && input.recovery.month === fineMonth)) {
    months = [fineMonth];
  } else if (input.recovery.mode === 'month') {
    if (input.recovery.month < fineMonth) return { error: 'Choose the fine month or a later month' };
    months = [input.recovery.month];
  } else {
    if (input.recovery.from < fineMonth) return { error: 'Choose the fine month or a later month' };
    if (input.recovery.to <= input.recovery.from) {
      return { error: 'Choose an end month after the start month' };
    }
    const listed = listPayrollMonths(input.recovery.from, input.recovery.to);
    if (!listed) return { error: 'Choose a start and end month' };
    if (listed.length > FINE_INSTALLMENT_MAX_MONTHS) {
      return { error: `A fine can be split across at most ${FINE_INSTALLMENT_MAX_MONTHS} months` };
    }
    months = listed;
  }

  const amounts = splitFineAmount(input.amount, months.length);
  if (!amounts) {
    const maxMonths = moneyToCents(input.amount);
    return { error: `This amount can be split across at most ${maxMonths} month${maxMonths === 1 ? '' : 's'}` };
  }

  return {
    installments: months.map((payrollMonth, index) => ({
      payrollMonth,
      amount: amounts[index],
      sequence: index + 1,
    })),
  };
}
