import {
  combineDateAndTimeToIsoAllowOvernight,
  diffMinutesAllowOvernight,
  resolveDisplayedOvertimeMinutes,
  workedMinutesFromPunches,
} from '@/lib/hr/attendanceDuration';
import { combineAttendancePunchTimesToIso } from '@/lib/hr/attendanceSheetModel';
import { resolveWorkedMinutesFromAttendance } from '@/lib/hr/payroll/resolveWorkedMinutes';
import { calculateOvertimeMinutes } from '@/lib/hr/attendanceBasicHours';

describe('overnight attendance duration', () => {
  it('counts 5am → 12:30am duty with 1pm–3pm break as 17.5h', () => {
    const punches = combineAttendancePunchTimesToIso('2026-06-01', {
      checkInAt: '05:00',
      checkOutAt: '00:30',
      breakInAt: '13:00',
      breakOutAt: '15:00',
    });

    expect(punches.checkInAt).toBeTruthy();
    expect(punches.checkOutAt).toBeTruthy();
    expect(new Date(punches.checkOutAt!).getTime()).toBeGreaterThan(new Date(punches.checkInAt!).getTime());

    const worked = workedMinutesFromPunches({
      checkInAt: new Date(punches.checkInAt!),
      checkOutAt: new Date(punches.checkOutAt!),
      breakStartAt: punches.breakInAt ? new Date(punches.breakInAt) : null,
      breakEndAt: punches.breakOutAt ? new Date(punches.breakOutAt) : null,
    });

    expect(worked).toBe(17.5 * 60);
    expect(calculateOvertimeMinutes(worked, 9, 'PRESENT')).toBe(8.5 * 60);
  });

  it('repairs same-calendar-day overnight stamps when reading punches', () => {
    const checkIn = new Date('2026-06-01T01:00:00.000Z'); // 05:00 Dubai
    const checkOut = new Date('2026-05-31T20:30:00.000Z'); // 00:30 Dubai same wall day (before check-in)
    expect(diffMinutesAllowOvernight(checkIn, checkOut)).toBe(19.5 * 60);

    const worked = workedMinutesFromPunches({
      checkInAt: checkIn,
      checkOutAt: checkOut,
      breakStartAt: new Date('2026-06-01T09:00:00.000Z'),
      breakEndAt: new Date('2026-06-01T11:00:00.000Z'),
    });
    expect(worked).toBe(17.5 * 60);
  });

  it('prefers punch minutes over stale stored workedMinutes in payroll', () => {
    const punches = combineAttendancePunchTimesToIso('2026-06-01', {
      checkInAt: '05:00',
      checkOutAt: '00:30',
      breakInAt: '13:00',
      breakOutAt: '15:00',
    });
    expect(
      resolveWorkedMinutesFromAttendance({
        status: 'PRESENT',
        basicHours: 9,
        workedMinutes: 540,
        overtimeMinutes: 0,
        checkInAt: new Date(punches.checkInAt!),
        checkOutAt: new Date(punches.checkOutAt!),
        breakStartAt: punches.breakInAt ? new Date(punches.breakInAt) : null,
        breakEndAt: punches.breakOutAt ? new Date(punches.breakOutAt) : null,
      })
    ).toBe(17.5 * 60);
  });

  it('rolls duty-out alone with combineDateAndTimeToIsoAllowOvernight', () => {
    const checkInIso = combineDateAndTimeToIsoAllowOvernight('2026-06-01', '05:00');
    const checkOutIso = combineDateAndTimeToIsoAllowOvernight(
      '2026-06-01',
      '00:30',
      checkInIso ? new Date(checkInIso) : null
    );
    expect(checkInIso).toBeTruthy();
    expect(checkOutIso).toBeTruthy();
    expect(diffMinutesAllowOvernight(new Date(checkInIso!), new Date(checkOutIso!))).toBe(19.5 * 60);
  });

  it('derives OT when stored overtime is zero but punches exceed basic', () => {
    expect(
      resolveDisplayedOvertimeMinutes({
        workedMinutes: 17.5 * 60,
        basicHours: 9,
        storedOvertimeMinutes: 0,
      })
    ).toBe(8.5 * 60);
  });
});
