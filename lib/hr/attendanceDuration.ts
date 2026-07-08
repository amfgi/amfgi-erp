import { dubaiWallTimeToUtc, parseTimeCell } from '@/lib/hr/dubaiShift';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Minutes between two timestamps; when end is before/equal start, treat as overnight (+24h). */
export function diffMinutesAllowOvernight(
  start: Date | null | undefined,
  end: Date | null | undefined
): number {
  if (!start || !end) return 0;
  let ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms)) return 0;
  if (ms <= 0) ms += DAY_MS;
  return Math.round(ms / 60000);
}

/** Same rule for ISO / JSON date strings (self-portal, client metrics). */
export function diffMinutesFromIsoAllowOvernight(
  start: string | null | undefined,
  end: string | null | undefined
): number {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return diffMinutesAllowOvernight(startDate, endDate);
}

/**
 * Wall-clock HH:MM (or 12h text) on workDate → UTC ISO.
 * When `after` is set and the stamp would not be after it, roll to the next calendar day
 * (overnight duty-out / break-in after midnight).
 */
export function combineDateAndTimeToIsoAllowOvernight(
  workDate: string,
  timeVal: string,
  after?: Date | null
): string | null {
  if (!timeVal) return null;
  const parsed = parseTimeCell(timeVal);
  if (!parsed) return null;
  let stamp = dubaiWallTimeToUtc(workDate, parsed.hour, parsed.minute);
  if (after && stamp.getTime() <= after.getTime()) {
    stamp = new Date(stamp.getTime() + DAY_MS);
  }
  return stamp.toISOString();
}

/** Worked minutes = duty span − break span (both overnight-aware). */
export function workedMinutesFromPunches(params: {
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  breakStartAt?: Date | null;
  breakEndAt?: Date | null;
}): number {
  const duty = diffMinutesAllowOvernight(params.checkInAt, params.checkOutAt);
  const breakMinutes = diffMinutesAllowOvernight(params.breakStartAt, params.breakEndAt);
  return Math.max(0, duty - breakMinutes);
}

export function workedMinutesFromIsoPunches(params: {
  checkInAt?: string | null;
  checkOutAt?: string | null;
  breakStartAt?: string | null;
  breakEndAt?: string | null;
}): number {
  const duty = diffMinutesFromIsoAllowOvernight(params.checkInAt, params.checkOutAt);
  const breakMinutes = diffMinutesFromIsoAllowOvernight(params.breakStartAt, params.breakEndAt);
  return Math.max(0, duty - breakMinutes);
}

/** Prefer punch-derived OT when stored OT is missing/stale (overnight rows saved before the fix). */
export function resolveDisplayedOvertimeMinutes(params: {
  workedMinutes: number;
  basicHours?: number | null;
  storedOvertimeMinutes?: number | null;
}): number {
  const basic =
    params.basicHours != null && Number.isFinite(params.basicHours) && params.basicHours > 0
      ? Math.round(params.basicHours * 60)
      : 0;
  const fromWorked = basic > 0 ? Math.max(0, params.workedMinutes - basic) : 0;
  const stored = Math.max(0, params.storedOvertimeMinutes ?? 0);
  return Math.max(stored, fromWorked);
}
