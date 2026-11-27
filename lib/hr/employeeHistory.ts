import { addCalendarDays, assessLeaveReturn } from '@/lib/hr/leaveReturn';
import { weekdayIndexYmd } from '@/lib/hr/payroll/calendar';

export type HistoryAttendanceRow = {
  workDate: string;
  status: string;
  lateMinutes?: number;
  earlyLeaveMinutes?: number;
  overtimeMinutes?: number;
  remarks?: string | null;
};

export type HistoryLeaveRow = {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  leaveTypeCode?: string | null;
  leaveTypeName?: string | null;
  legacyLeaveType?: string | null;
};

export type CountedDay = {
  date: string;
  status: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  countedAs: 'worked' | 'half day' | 'absent' | 'missing punch' | 'weekly off' | 'owned by leave' | 'not counted';
  remark: string | null;
};

export type HistoryDayNote = { date: string; note: string };

export type HistoryLeaveTotal = {
  id: string;
  typeName: string;
  startDate: string;
  endDate: string;
  days: number;
  notes: HistoryDayNote[];
};

export type EmployeeHistoryCounts = {
  workedDays: number;
  halfDays: number;
  absentDays: number;
  unauthorisedDays: number;
  overstayDays: number;
  missingPunchDays: number;
  sickDays: number;
  paidDays: number;
  unpaidDays: number;
  annualDays: number;
  otherLeave: Array<{ name: string; days: number }>;
  returnNotMarked: number;
  lateDays: number;
  lateMinutes: number;
  earlyDays: number;
  earlyMinutes: number;
  overtimeMinutes: number;
  leaves: HistoryLeaveTotal[];
  absentNotes: HistoryDayNote[];
  attendanceDays: CountedDay[];
  exceptions: {
    late: CountedDay[];
    early: CountedDay[];
    unauthorised: CountedDay[];
    missingPunch: CountedDay[];
    overstay: CountedDay[];
  };
};

/** Visa covering today, otherwise the active period with the latest end date. */
export function selectCurrentVisaPeriod<T extends { status: string; startDate: string; endDate: string }>(
  periods: T[],
  today: string,
): T | null {
  const open = periods.filter((row) => row.status !== 'CANCELLED' && row.startDate <= today && row.endDate >= today);
  const pool = open.length > 0 ? open : periods.filter((row) => row.status === 'ACTIVE');
  return [...pool].sort((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? null;
}

export function absentDateRows(counts: Pick<EmployeeHistoryCounts, 'exceptions'>): Array<{ date: string; note: string }> {
  return [...counts.exceptions.unauthorised, ...counts.exceptions.overstay]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({ date: day.date, note: day.remark ?? '' }));
}

const STATUS_RANK: Record<string, number> = {
  PRESENT: 4,
  HALF_DAY: 3,
  ABSENT: 2,
  LEAVE: 2,
  MISSING_PUNCH: 1,
};

/** Same span the opened report uses. A start after the end counts as no days. */
export function absenceCountRange(input: {
  hireDate: string | null;
  terminationDate: string | null;
  earliestRecordDate: string | null;
  from: string | null;
  to: string | null;
  today: string;
}): { from: string; to: string } | null {
  const defaultEnd = input.terminationDate && input.terminationDate <= input.today ? input.terminationDate : input.today;
  const from = input.from ?? input.hireDate ?? input.earliestRecordDate ?? defaultEnd;
  const to = input.to ?? defaultEnd;
  if (from > to) return null;
  return { from, to };
}

function remarkText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function ymd(value: string): string {
  return value.slice(0, 10);
}

function lastDayOfMonth(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

export function payRangeIsWholeMonths(from: string, to: string): boolean {
  return from.endsWith('-01') && to === lastDayOfMonth(to.slice(0, 7));
}

export function monthOverlapsRange(month: string, from: string, to: string): boolean {
  const start = `${month}-01`;
  const end = lastDayOfMonth(month);
  return start <= to && end >= from;
}

function isWeeklyOff(workDate: string, excludedWeekdays: number[]): boolean {
  const days = [...new Set(excludedWeekdays.filter((day) => day >= 0 && day <= 6))];
  if (days.length >= 7) return false;
  return days.includes(weekdayIndexYmd(workDate));
}

function datesInRange(start: string, end: string): string[] {
  if (start > end) return [];
  const dates: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 4000) {
    dates.push(cursor);
    cursor = addCalendarDays(cursor, 1);
    guard += 1;
  }
  return dates;
}

function leaveBucket(leave: HistoryLeaveRow): { bucket: 'SICK' | 'PAID' | 'UNPAID' | 'ANNUAL' | 'OTHER'; name: string } {
  const code = leave.leaveTypeCode?.trim().toUpperCase() ?? '';
  if (code === 'SICK' || code === 'PAID' || code === 'UNPAID' || code === 'ANNUAL') {
    return { bucket: code, name: leave.leaveTypeName?.trim() || code };
  }
  if (!code) {
    const legacy = leave.legacyLeaveType?.trim().toUpperCase() ?? '';
    if (legacy === 'SICK') return { bucket: 'SICK', name: leave.leaveTypeName?.trim() || 'Sick leave' };
    if (legacy === 'ANNUAL') return { bucket: 'ANNUAL', name: leave.leaveTypeName?.trim() || 'Annual leave' };
    if (legacy === 'EMERGENCY' || legacy === 'ONE_DAY') {
      return { bucket: 'PAID', name: leave.leaveTypeName?.trim() || 'Paid leave' };
    }
  }
  return { bucket: 'OTHER', name: leave.leaveTypeName?.trim() || leave.legacyLeaveType?.trim() || 'Other leave' };
}

function emptyCounts(): EmployeeHistoryCounts {
  return {
    workedDays: 0,
    halfDays: 0,
    absentDays: 0,
    unauthorisedDays: 0,
    overstayDays: 0,
    missingPunchDays: 0,
    sickDays: 0,
    paidDays: 0,
    unpaidDays: 0,
    annualDays: 0,
    otherLeave: [],
    returnNotMarked: 0,
    lateDays: 0,
    lateMinutes: 0,
    earlyDays: 0,
    earlyMinutes: 0,
    overtimeMinutes: 0,
    leaves: [],
    absentNotes: [],
    attendanceDays: [],
    exceptions: { late: [], early: [], unauthorised: [], missingPunch: [], overstay: [] },
  };
}

export function buildEmployeeHistory(input: {
  from: string;
  to: string;
  attendance: HistoryAttendanceRow[];
  leaves: HistoryLeaveRow[];
  excludedWeekdaysForDate?: (workDate: string) => number[];
}): EmployeeHistoryCounts {
  const from = ymd(input.from);
  const to = ymd(input.to);
  const counts = emptyCounts();
  if (from > to) return counts;

  const excludedWeekdaysForDate = input.excludedWeekdaysForDate ?? (() => [0]);
  const approved = input.leaves
    .filter((leave) => leave.status === 'APPROVED')
    .map((leave) => ({
      ...leave,
      startDate: ymd(leave.startDate),
      endDate: ymd(leave.endDate),
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));

  const ownerByDate = new Map<string, (typeof approved)[number]>();
  for (const leave of approved) {
    const clipStart = leave.startDate > from ? leave.startDate : from;
    const clipEnd = leave.endDate < to ? leave.endDate : to;
    for (const date of datesInRange(clipStart, clipEnd)) {
      if (!ownerByDate.has(date)) ownerByDate.set(date, leave);
    }
  }

  const daysByLeave = new Map<string, number>();
  for (const leave of ownerByDate.values()) {
    daysByLeave.set(leave.id, (daysByLeave.get(leave.id) ?? 0) + 1);
  }
  const otherLeaveDays = new Map<string, number>();
  for (const leave of approved) {
    const clipStart = leave.startDate > from ? leave.startDate : from;
    const clipEnd = leave.endDate < to ? leave.endDate : to;
    if (clipStart > clipEnd) continue;
    const days = daysByLeave.get(leave.id) ?? 0;
    const bucket = leaveBucket(leave);
    counts.leaves.push({
      id: leave.id,
      typeName: bucket.name,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days,
      notes: [],
    });
    if (bucket.bucket === 'SICK') counts.sickDays += days;
    else if (bucket.bucket === 'PAID') counts.paidDays += days;
    else if (bucket.bucket === 'UNPAID') counts.unpaidDays += days;
    else if (bucket.bucket === 'ANNUAL') counts.annualDays += days;
    else otherLeaveDays.set(bucket.name, (otherLeaveDays.get(bucket.name) ?? 0) + days);
  }
  counts.otherLeave = [...otherLeaveDays.entries()].map(([name, days]) => ({ name, days }));

  const rowsByDate = new Map<string, HistoryAttendanceRow[]>();
  for (const row of input.attendance) {
    const date = ymd(row.workDate);
    if (date < from || date > to) continue;
    const list = rowsByDate.get(date);
    if (list) list.push(row);
    else rowsByDate.set(date, [row]);
  }

  const absentDates = new Set<string>();
  const collapsed = [...rowsByDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [date, rows] of collapsed) {
    let winning = rows[0];
    let rank = STATUS_RANK[winning.status] ?? 0;
    for (const row of rows.slice(1)) {
      const next = STATUS_RANK[row.status] ?? 0;
      if (next > rank) {
        winning = row;
        rank = next;
      }
    }
    const sameStatus = rows.filter((row) => row.status === winning.status);
    const lateMinutes = sameStatus.reduce((sum, row) => sum + (row.lateMinutes ?? 0), 0);
    const earlyLeaveMinutes = sameStatus.reduce((sum, row) => sum + (row.earlyLeaveMinutes ?? 0), 0);
    const overtimeMinutes = sameStatus.reduce((sum, row) => sum + (row.overtimeMinutes ?? 0), 0);
    const owned = ownerByDate.has(date);
    const weeklyOff = isWeeklyOff(date, excludedWeekdaysForDate(date));
    let countedAs: CountedDay['countedAs'] = 'not counted';
    if (owned) countedAs = 'owned by leave';
    else if (winning.status === 'PRESENT') countedAs = 'worked';
    else if (winning.status === 'HALF_DAY') countedAs = 'half day';
    else if ((winning.status === 'ABSENT' || winning.status === 'LEAVE') && weeklyOff) countedAs = 'weekly off';
    else if (winning.status === 'ABSENT' || winning.status === 'LEAVE') countedAs = 'absent';
    else if (winning.status === 'MISSING_PUNCH') countedAs = 'missing punch';

    const remark = remarkText(winning.remarks);
    const day: CountedDay = {
      date,
      status: winning.status,
      lateMinutes: countedAs === 'worked' || countedAs === 'half day' ? lateMinutes : 0,
      earlyLeaveMinutes: countedAs === 'worked' || countedAs === 'half day' ? earlyLeaveMinutes : 0,
      overtimeMinutes: countedAs === 'worked' || countedAs === 'half day' ? overtimeMinutes : 0,
      countedAs,
      remark,
    };
    counts.attendanceDays.push(day);
    if (countedAs === 'owned by leave' && remark) {
      const owner = ownerByDate.get(date);
      const leave = owner ? counts.leaves.find((row) => row.id === owner.id) : undefined;
      leave?.notes.push({ date, note: remark });
    }

    if (countedAs === 'worked') counts.workedDays += 1;
    if (countedAs === 'half day') {
      counts.workedDays += 0.5;
      counts.halfDays += 1;
    }
    if (countedAs === 'absent') absentDates.add(date);
    if (countedAs === 'missing punch') {
      counts.missingPunchDays += 1;
      counts.exceptions.missingPunch.push(day);
    }
    if (day.lateMinutes > 0) {
      counts.lateDays += 1;
      counts.lateMinutes += day.lateMinutes;
      counts.exceptions.late.push(day);
    }
    if (day.earlyLeaveMinutes > 0) {
      counts.earlyDays += 1;
      counts.earlyMinutes += day.earlyLeaveMinutes;
      counts.exceptions.early.push(day);
    }
    counts.overtimeMinutes += day.overtimeMinutes;
  }

  const attendanceForReturn = input.attendance.map((row) => ({
    workDate: ymd(row.workDate),
    status: row.status,
  }));
  const overstayDates = new Set<string>();
  for (const leave of approved) {
    const assessment = assessLeaveReturn({
      status: 'APPROVED',
      endDate: leave.endDate,
      today: to,
      attendance: attendanceForReturn,
      otherApprovedLeave: approved
        .filter((other) => other.id !== leave.id)
        .map((other) => ({ startDate: other.startDate, endDate: other.endDate })),
      excludedWeekdaysForDate,
      includeExtraDates: true,
    });
    if ((assessment.extraDays ?? 0) > 0) {
      for (const date of assessment.extraDates) {
        if (date >= from && date <= to && absentDates.has(date)) overstayDates.add(date);
      }
    }
    if (assessment.returnResult === 'NOT_MARKED') {
      const nextDay = addCalendarDays(leave.endDate, 1);
      if (nextDay >= from && nextDay <= to) counts.returnNotMarked += 1;
    }
  }

  for (const date of absentDates) {
    const day = counts.attendanceDays.find((row) => row.date === date);
    if (!day) continue;
    if (overstayDates.has(date)) counts.exceptions.overstay.push(day);
    else counts.exceptions.unauthorised.push(day);
  }
  counts.overstayDays = overstayDates.size;
  counts.unauthorisedDays = absentDates.size - overstayDates.size;
  counts.absentDays = absentDates.size;
  counts.absentNotes = counts.attendanceDays.flatMap((day) =>
    day.countedAs === 'absent' && day.remark ? [{ date: day.date, note: day.remark }] : [],
  );
  counts.workedDays = Math.round(counts.workedDays * 10) / 10;
  return counts;
}
