import { isLeavePaidForPay } from '@/lib/hr/attendanceLeavePay';
import { isPayrollHolidayLine } from '@/lib/hr/payroll/holidayPayLine';
import { daysInMonth, isExcludedWeekdayYmd } from '@/lib/hr/payroll/calendar';
import { isAttendancePresentLine } from '@/lib/hr/payroll/payDayStatus';
import {
  WEEKLY_OFF_PAY_MODES,
  resolveExcludedWeekdays,
} from '@/lib/hr/payroll/payTypeConfigHelpers';
import { shouldPayExcludedWeekdayWorkAtOtOnly } from '@/lib/hr/payroll/excludedWeekdayOtPay';
import type { PayLineInput, PayTypeConfig } from '@/lib/hr/payroll/types';

/** True when a non-weekly-off day counts as a paid neighbour for the sandwiched rule. */
export function isPaidNeighbourDay(line: PayLineInput): boolean {
  if (isPayrollHolidayLine(line)) return true;
  if (isLeavePaidForPay(line)) return true;
  if (line.status === 'PRESENT' || line.status === 'HALF_DAY') return true;
  if (isAttendancePresentLine(line)) return true;
  return false;
}

function monthFromYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

/** True when the month still has a non-excluded weekday before / after ymd (calendar, not attendance). */
export function hasNonExcludedWeekdayInMonth(
  ymd: string,
  excluded: number[],
  direction: 'before' | 'after'
): boolean {
  const month = monthFromYmd(ymd);
  const total = daysInMonth(month);
  const day = Number(ymd.slice(8, 10));

  if (direction === 'before') {
    for (let d = day - 1; d >= 1; d -= 1) {
      const candidate = `${month}-${String(d).padStart(2, '0')}`;
      if (!isExcludedWeekdayYmd(candidate, excluded)) return true;
    }
    return false;
  }

  for (let d = day + 1; d <= total; d += 1) {
    const candidate = `${month}-${String(d).padStart(2, '0')}`;
    if (!isExcludedWeekdayYmd(candidate, excluded)) return true;
  }
  return false;
}

/**
 * Dates of weekly-off (excluded weekday) lines that should be paid as rest days.
 * SANDWICHED: nearest non-weekly-off day before AND after must both be paid.
 * At month edges (no non-excluded weekday left in the month on that side), only the
 * existing side is required. Missing attendance rows count as unpaid neighbours.
 */
export function resolvePaidWeeklyOffDates(
  lines: PayLineInput[],
  config: PayTypeConfig
): Set<string> {
  const paid = new Set<string>();
  if (config.weeklyOffPayRule !== 'SANDWICHED') return paid;
  if (!WEEKLY_OFF_PAY_MODES.has(config.mode)) return paid;

  const excluded = resolveExcludedWeekdays(config);
  if (excluded.length === 0) return paid;

  const sorted = [...lines].sort((a, b) => a.workDate.localeCompare(b.workDate));
  const nonExcluded = sorted.filter((line) => !isExcludedWeekdayYmd(line.workDate, excluded));

  for (const line of sorted) {
    if (!isExcludedWeekdayYmd(line.workDate, excluded)) continue;
    if (isPayrollHolidayLine(line)) continue;
    if (isLeavePaidForPay(line)) continue;
    if (shouldPayExcludedWeekdayWorkAtOtOnly(line, config)) continue;

    const needBefore = hasNonExcludedWeekdayInMonth(line.workDate, excluded, 'before');
    const needAfter = hasNonExcludedWeekdayInMonth(line.workDate, excluded, 'after');
    if (!needBefore && !needAfter) continue;

    const before = [...nonExcluded].reverse().find((n) => n.workDate < line.workDate);
    const after = nonExcluded.find((n) => n.workDate > line.workDate);

    if (needBefore && (!before || !isPaidNeighbourDay(before))) continue;
    if (needAfter && (!after || !isPaidNeighbourDay(after))) continue;

    paid.add(line.workDate);
  }

  return paid;
}

/** Stamp isPaidWeeklyOff on pay lines for the given config. */
export function annotatePaidWeeklyOffLines(
  lines: PayLineInput[],
  config: PayTypeConfig
): PayLineInput[] {
  const paidDates = resolvePaidWeeklyOffDates(lines, config);
  if (paidDates.size === 0) {
    return lines.map((line) => (line.isPaidWeeklyOff ? { ...line, isPaidWeeklyOff: false } : line));
  }
  return lines.map((line) => ({
    ...line,
    isPaidWeeklyOff: paidDates.has(line.workDate),
  }));
}
