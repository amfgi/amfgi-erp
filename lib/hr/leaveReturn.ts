import { weekdayIndexYmd } from '@/lib/hr/payroll/calendar';
import { dateFromYmd } from '@/lib/hr/workDate';

export const LEAVE_RETURN_RESULTS = [
  'ON_TIME',
  'STILL_ON_LEAVE',
  'NOT_RETURNED',
  'NOT_MARKED',
  'ANOTHER_LEAVE',
] as const;

export type LeaveReturnResult = (typeof LEAVE_RETURN_RESULTS)[number];

export type LeaveReturnAttendance = {
  workDate: string;
  status: string;
};

export type LeaveReturnSpan = {
  startDate: string;
  endDate: string;
};

export type LeaveReturnAssessment = {
  returnDate: string | null;
  returnResult: LeaveReturnResult | null;
  extraDays: number | null;
};

export type LeaveReturnAssessmentWithDates = LeaveReturnAssessment & {
  extraDates: string[];
};

type AssessLeaveReturnInput = {
  status: string;
  endDate: string;
  today: string;
  attendance: LeaveReturnAttendance[];
  otherApprovedLeave?: LeaveReturnSpan[];
  excludedWeekdaysForDate?: (workDate: string) => number[];
  includeExtraDates?: boolean;
};

const PRESENT_STATUSES = new Set(['PRESENT', 'HALF_DAY']);
const ABSENT_STATUSES = new Set(['ABSENT', 'LEAVE']);

export function dubaiTodayYmd(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(ymd: string, days: number): string {
  const date = dateFromYmd(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function ymd(value: string): string {
  return value.slice(0, 10);
}

function isWeeklyOff(workDate: string, excludedWeekdays: number[]): boolean {
  const days = [...new Set(excludedWeekdays.filter((day) => day >= 0 && day <= 6))];
  if (days.length >= 7) return false;
  return days.includes(weekdayIndexYmd(workDate));
}

function coveredByLeave(workDate: string, leaves: LeaveReturnSpan[]): boolean {
  return leaves.some((leave) => ymd(leave.startDate) <= workDate && workDate <= ymd(leave.endDate));
}

function signalForDay(rows: LeaveReturnAttendance[]): 'present' | 'absent' | 'none' {
  let absent = false;
  for (const row of rows) {
    if (PRESENT_STATUSES.has(row.status)) return 'present';
    if (ABSENT_STATUSES.has(row.status)) absent = true;
  }
  return absent ? 'absent' : 'none';
}

/**
 * Compare an approved leave with attendance after its end date.
 * Present rows inside the approved dates are ignored. Unmarked days are not extra days.
 */
export function assessLeaveReturn(
  input: AssessLeaveReturnInput & { includeExtraDates: true }
): LeaveReturnAssessmentWithDates;
export function assessLeaveReturn(input: AssessLeaveReturnInput): LeaveReturnAssessment;
export function assessLeaveReturn(
  input: AssessLeaveReturnInput
): LeaveReturnAssessment | LeaveReturnAssessmentWithDates {
  const extraDates: string[] = [];
  const finish = (assessment: LeaveReturnAssessment): LeaveReturnAssessment | LeaveReturnAssessmentWithDates => {
    if (!input.includeExtraDates) return assessment;
    return { ...assessment, extraDates };
  };

  if (input.status !== 'APPROVED') {
    return finish({ returnDate: null, returnResult: null, extraDays: null });
  }

  const endDate = ymd(input.endDate);
  const today = ymd(input.today);
  if (today <= endDate) {
    return finish({ returnDate: null, returnResult: 'STILL_ON_LEAVE', extraDays: null });
  }

  const otherLeave = input.otherApprovedLeave ?? [];
  const excludedWeekdaysForDate = input.excludedWeekdaysForDate ?? (() => [0]);
  const byDate = new Map<string, LeaveReturnAttendance[]>();
  for (const row of input.attendance) {
    const workDate = ymd(row.workDate);
    if (workDate <= endDate || workDate > today) continue;
    const list = byDate.get(workDate);
    if (list) list.push(row);
    else byDate.set(workDate, [row]);
  }

  let returnDate: string | null = null;
  let extraDays = 0;
  let sawAbsentWorkingDay = false;
  let cursor = addCalendarDays(endDate, 1);
  let guard = 0;

  while (cursor <= today && guard < 4000) {
    guard += 1;
    const weeklyOff = isWeeklyOff(cursor, excludedWeekdaysForDate(cursor));
    const onOtherLeave = coveredByLeave(cursor, otherLeave);
    const signal = signalForDay(byDate.get(cursor) ?? []);

    if (onOtherLeave) {
      if (!sawAbsentWorkingDay) {
        return finish({ returnDate: null, returnResult: 'ANOTHER_LEAVE', extraDays: 0 });
      }
      cursor = addCalendarDays(cursor, 1);
      continue;
    }

    if (signal === 'present') {
      returnDate = cursor;
      break;
    }

    if (signal === 'absent' && !weeklyOff) {
      extraDays += 1;
      sawAbsentWorkingDay = true;
      extraDates.push(cursor);
    }

    cursor = addCalendarDays(cursor, 1);
  }

  if (returnDate) {
    return finish({
      returnDate,
      returnResult: 'ON_TIME',
      extraDays,
    });
  }

  if (sawAbsentWorkingDay) {
    return finish({ returnDate: null, returnResult: 'NOT_RETURNED', extraDays });
  }

  return finish({ returnDate: null, returnResult: 'NOT_MARKED', extraDays: null });
}
