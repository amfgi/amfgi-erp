import { isLeavePaidForPay } from '@/lib/hr/attendanceLeavePay';
import { roundMoney } from '@/lib/hr/payroll/calendar';
import { lineBasicHours } from '@/lib/hr/payroll/lineBasicHours';
import { formatPayDayStatus } from '@/lib/hr/payroll/payDayStatus';
import type { PayDayBreakdown, PayLineInput } from '@/lib/hr/payroll/types';

export { isLeavePaidForPay } from '@/lib/hr/attendanceLeavePay';
export { formatPayDayStatus, isAttendancePresentLine, isExcludedWeekdayLine } from '@/lib/hr/payroll/payDayStatus';

export function workedHoursFromMinutes(minutes: number): number {
  return Math.round((Math.max(0, minutes) / 60) * 100) / 100;
}

export function resolveDayHoursForBreakdown(line: PayLineInput): {
  totalHours: number;
  basicHours: number;
  otHours: number;
  lineBasic: number;
} {
  const lineBasicRaw = lineBasicHours(line);
  const lineBasic = lineBasicRaw ?? 0;
  const workedHours = workedHoursFromMinutes(line.workedMinutes);
  if (workedHours <= 0) {
    return { totalHours: 0, basicHours: 0, otHours: 0, lineBasic };
  }
  if (lineBasic <= 0) {
    return { totalHours: workedHours, basicHours: workedHours, otHours: 0, lineBasic };
  }
  const basicHours = Math.min(workedHours, lineBasic);
  const otHours = Math.max(0, workedHours - lineBasic);
  return { totalHours: workedHours, basicHours, otHours, lineBasic };
}

/** Avoids penny drift when OT hours are zero (e.g. daily wage at exactly basic hours). */
export function splitBasicOtSalary(params: {
  totalSalary: number;
  basicHours: number;
  otHours: number;
  basicHourRate: number;
  otHourRate: number;
}): { basicHourSalary: number; otHourSalary: number } {
  const { totalSalary, otHours, basicHourRate, otHourRate } = params;
  if (otHours <= 0) {
    return { basicHourSalary: roundMoney(totalSalary), otHourSalary: 0 };
  }
  const otHourSalary = roundMoney(otHours * otHourRate);
  const basicHourSalary = roundMoney(totalSalary - otHourSalary);
  return { basicHourSalary, otHourSalary };
}

export function emptyPayDayBreakdown(line: PayLineInput): PayDayBreakdown {
  return {
    date: line.workDate,
    status: formatPayDayStatus(line),
    totalHours: 0,
    basicHours: 0,
    otHours: 0,
    basicHourRate: 0,
    basicHourSalary: 0,
    otHourRate: 0,
    otHourSalary: 0,
    allowance: 0,
    totalSalary: 0,
    amount: 0,
  };
}

export function finishPayDayBreakdown(
  row: Omit<PayDayBreakdown, 'amount' | 'totalHours'> & { totalHours?: number }
): PayDayBreakdown {
  const totalHours =
    row.totalHours != null && row.totalHours > 0
      ? row.totalHours
      : roundHours(row.basicHours + row.otHours);
  return {
    ...row,
    totalHours,
    amount: row.totalSalary,
  };
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Day row for a leave line: pays dailyRate x leavePayPercent when the leave type is paid,
 * plus the day's share of attendance-based salary components.
 */
export function buildLeavePayDayRow(
  line: PayLineInput,
  dailyRate: number,
  componentSplit?: { earning: number; deduction: number }
): PayDayBreakdown {
  const label = line.leaveTypeLabel
    ? `Leave (${line.leaveTypeLabel})`
    : line.leaveType
      ? `Leave (${line.leaveType.replace(/_/g, ' ')})`
      : 'Leave';

  if (!isLeavePaidForPay(line)) {
    return finishPayDayBreakdown({
      date: line.workDate,
      status: label,
      basicHours: 0,
      otHours: 0,
      basicHourRate: 0,
      basicHourSalary: 0,
      otHourRate: 0,
      otHourSalary: 0,
      allowance: 0,
      totalSalary: 0,
      detail: 'Unpaid leave',
    });
  }

  const pct = line.leavePayPercent ?? 100;
  const dayPay = roundMoney(dailyRate * (pct / 100));
  const componentEarning = componentSplit?.earning ?? 0;
  const componentDeduction = componentSplit?.deduction ?? 0;
  const allowance = roundMoney(componentEarning - componentDeduction);

  return finishPayDayBreakdown({
    date: line.workDate,
    status: label,
    basicHours: 0,
    otHours: 0,
    basicHourRate: dailyRate,
    basicHourSalary: dayPay,
    otHourRate: 0,
    otHourSalary: 0,
    allowance,
    componentEarning: componentSplit ? componentEarning : undefined,
    componentDeduction: componentSplit ? componentDeduction : undefined,
    totalSalary: roundMoney(dayPay + allowance),
    detail: pct < 100 ? `${pct}% paid leave` : 'Paid leave',
  });
}

export function sortPayDayBreakdowns(rows: PayDayBreakdown[]): PayDayBreakdown[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeCustomDayTrace(
  lines: PayLineInput[],
  trace: Array<{ date: string; amount: number; detail?: string }>,
): PayDayBreakdown[] {
  const byDate = new Map(trace.map((row) => [row.date, row]));
  return sortPayDayBreakdowns(
    lines.map((line) => {
      const hit = byDate.get(line.workDate);
      const totalSalary = roundMoney(hit?.amount ?? 0);
      const { totalHours, basicHours, otHours } = resolveDayHoursForBreakdown(line);
      return finishPayDayBreakdown({
        date: line.workDate,
        status: formatPayDayStatus(line),
        totalHours,
        basicHours,
        otHours,
        basicHourRate: 0,
        basicHourSalary: totalSalary,
        otHourRate: 0,
        otHourSalary: 0,
        allowance: 0,
        totalSalary,
        detail: hit?.detail,
      });
    }),
  );
}
