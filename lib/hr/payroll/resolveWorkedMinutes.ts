import { basicHoursToMinutes } from '@/lib/hr/attendanceBasicHours';
import { workedMinutesFromPunches } from '@/lib/hr/attendanceDuration';
import type { Prisma } from '@prisma/client';

const PAYABLE_WITHOUT_PUNCH = new Set(['PRESENT', 'HALF_DAY', 'MISSING_PUNCH']);

export type AttendanceWorkedMinutesInput = {
  status: string;
  basicHours: number | Prisma.Decimal | { toString(): string };
  workedMinutes?: number;
  overtimeMinutes?: number;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  breakStartAt?: Date | null;
  breakEndAt?: Date | null;
};

/** Resolves total worked minutes from punches, stored OT, or scheduled basic hours. */
export function resolveWorkedMinutesFromAttendance(row: AttendanceWorkedMinutesInput): number {
  const fromPunch = workedMinutesFromPunches({
    checkInAt: row.checkInAt,
    checkOutAt: row.checkOutAt,
    breakStartAt: row.breakStartAt,
    breakEndAt: row.breakEndAt,
  });
  if (fromPunch > 0) return fromPunch;

  if (row.workedMinutes != null && row.workedMinutes > 0) {
    return row.workedMinutes;
  }

  if (row.status === 'ABSENT' || row.status === 'LEAVE') return 0;

  const basicMinutes = basicHoursToMinutes(row.basicHours);
  const overtimeMinutes = Math.max(0, row.overtimeMinutes ?? 0);

  if (overtimeMinutes > 0 && basicMinutes > 0) {
    return basicMinutes + overtimeMinutes;
  }

  if (PAYABLE_WITHOUT_PUNCH.has(row.status) && basicMinutes > 0) {
    return basicMinutes;
  }

  return overtimeMinutes;
}
