import { absenceCountRange, absentDateRows, buildEmployeeHistory, payRangeIsWholeMonths } from '@/lib/hr/employeeHistory';

const from = '2026-10-01';
const to = '2026-10-31';
const friday = '2026-10-09';
const saturday = '2026-10-10';
const sunday = '2026-10-11';
const monday = '2026-10-12';

function history(
  overrides: Partial<Parameters<typeof buildEmployeeHistory>[0]>
) {
  return buildEmployeeHistory({
    from,
    to,
    attendance: [],
    leaves: [],
    ...overrides,
  });
}

describe('buildEmployeeHistory', () => {
  it('does not count a present day inside approved leave as worked or late', () => {
    const result = history({
      leaves: [
        {
          id: 'sick',
          status: 'APPROVED',
          startDate: friday,
          endDate: friday,
          leaveTypeCode: 'SICK',
          leaveTypeName: 'Sick leave',
        },
      ],
      attendance: [
        { workDate: friday, status: 'PRESENT', lateMinutes: 20, overtimeMinutes: 30 },
        { workDate: monday, status: 'PRESENT' },
      ],
    });
    expect(result.workedDays).toBe(1);
    expect(result.sickDays).toBe(1);
    expect(result.lateDays).toBe(0);
    expect(result.overtimeMinutes).toBe(0);
    expect(result.attendanceDays.find((day) => day.date === friday)?.countedAs).toBe('owned by leave');
  });

  it('splits absent days into unauthorised and overstay without adding them twice', () => {
    const result = history({
      leaves: [
        {
          id: 'annual',
          status: 'APPROVED',
          startDate: friday,
          endDate: friday,
          leaveTypeCode: 'ANNUAL',
          leaveTypeName: 'Annual leave',
        },
      ],
      attendance: [
        { workDate: saturday, status: 'ABSENT' },
        { workDate: sunday, status: 'ABSENT' },
        { workDate: monday, status: 'PRESENT' },
        { workDate: '2026-10-13', status: 'ABSENT' },
      ],
    });
    expect(result.overstayDays).toBe(1);
    expect(result.unauthorisedDays).toBe(1);
    expect(result.absentDays).toBe(2);
    expect(result.exceptions.overstay.map((day) => day.date)).toEqual([saturday]);
    expect(result.exceptions.unauthorised.map((day) => day.date)).toEqual(['2026-10-13']);
  });

  it('counts a half day as half a worked day and ignores a second row on that date', () => {
    const result = history({
      attendance: [
        { workDate: monday, status: 'HALF_DAY', lateMinutes: 5 },
        { workDate: monday, status: 'ABSENT', lateMinutes: 90 },
      ],
    });
    expect(result.workedDays).toBe(0.5);
    expect(result.halfDays).toBe(1);
    expect(result.absentDays).toBe(0);
    expect(result.lateMinutes).toBe(5);
  });

  it('does not count an absent weekly off, including a daily-wage package with no weekly off list', () => {
    const sundayOff = history({
      attendance: [{ workDate: sunday, status: 'ABSENT' }],
    });
    expect(sundayOff.absentDays).toBe(0);
    expect(sundayOff.attendanceDays[0]?.countedAs).toBe('weekly off');

    const noWeeklyOff = history({
      excludedWeekdaysForDate: () => [],
      attendance: [{ workDate: sunday, status: 'ABSENT' }],
    });
    expect(noWeeklyOff.absentDays).toBe(1);

    const everyDayExcluded = history({
      excludedWeekdaysForDate: () => [0, 1, 2, 3, 4, 5, 6],
      attendance: [{ workDate: sunday, status: 'ABSENT' }],
    });
    expect(everyDayExcluded.absentDays).toBe(1);
  });

  it('counts a present weekly off as worked', () => {
    const result = history({
      attendance: [{ workDate: sunday, status: 'PRESENT', overtimeMinutes: 60 }],
    });
    expect(result.workedDays).toBe(1);
    expect(result.overtimeMinutes).toBe(60);
    expect(result.attendanceDays[0]?.countedAs).toBe('worked');
  });

  it('keeps a custom leave type out of paid and ignores pending leave', () => {
    const result = history({
      leaves: [
        {
          id: 'pending',
          status: 'PENDING',
          startDate: monday,
          endDate: monday,
          leaveTypeCode: 'SICK',
          leaveTypeName: 'Sick leave',
        },
        {
          id: 'hajj',
          status: 'APPROVED',
          startDate: monday,
          endDate: monday,
          leaveTypeCode: 'HAJJ',
          leaveTypeName: 'Hajj leave',
        },
      ],
    });
    expect(result.sickDays).toBe(0);
    expect(result.paidDays).toBe(0);
    expect(result.otherLeave).toEqual([{ name: 'Hajj leave', days: 1 }]);
  });

  it('maps a legacy emergency request to paid leave and counts an overlapping day once', () => {
    const result = history({
      leaves: [
        {
          id: 'b',
          status: 'APPROVED',
          startDate: monday,
          endDate: '2026-10-13',
          legacyLeaveType: 'EMERGENCY',
        },
        {
          id: 'a',
          status: 'APPROVED',
          startDate: monday,
          endDate: monday,
          leaveTypeCode: 'SICK',
          leaveTypeName: 'Sick leave',
        },
      ],
    });
    expect(result.sickDays).toBe(1);
    expect(result.paidDays).toBe(1);
    expect(result.leaves.find((leave) => leave.id === 'a')?.days).toBe(1);
    expect(result.leaves.find((leave) => leave.id === 'b')?.days).toBe(1);
  });

  it('counts a missing punch on its own and does not treat a blank day as absent', () => {
    const result = history({
      attendance: [{ workDate: monday, status: 'MISSING_PUNCH' }],
    });
    expect(result.missingPunchDays).toBe(1);
    expect(result.absentDays).toBe(0);
    expect(result.workedDays).toBe(0);
  });

  it('does not call a later absence overstay when the employee already returned before the range', () => {
    const result = history({
      from: monday,
      leaves: [
        {
          id: 'annual',
          status: 'APPROVED',
          startDate: friday,
          endDate: friday,
          leaveTypeCode: 'ANNUAL',
        },
      ],
      attendance: [
        { workDate: saturday, status: 'PRESENT' },
        { workDate: '2026-10-13', status: 'ABSENT' },
      ],
    });
    expect(result.overstayDays).toBe(0);
    expect(result.unauthorisedDays).toBe(1);
    expect(result.absentDays).toBe(1);
    expect(result.workedDays).toBe(0);
  });

  it('counts return not marked only when the next day is inside the selected range', () => {
    const inside = history({
      leaves: [
        {
          id: 'annual',
          status: 'APPROVED',
          startDate: friday,
          endDate: friday,
          leaveTypeCode: 'ANNUAL',
        },
      ],
    });
    expect(inside.returnNotMarked).toBe(1);
    expect(inside.absentDays).toBe(0);

    const outside = history({
      from: monday,
      leaves: [
        {
          id: 'annual',
          status: 'APPROVED',
          startDate: friday,
          endDate: friday,
          leaveTypeCode: 'ANNUAL',
        },
      ],
    });
    expect(outside.returnNotMarked).toBe(0);
  });

  it('treats a pay range as whole months only when it starts on day 1 and ends on the last day', () => {
    expect(payRangeIsWholeMonths('2026-10-01', '2026-11-30')).toBe(true);
    expect(payRangeIsWholeMonths('2026-10-02', '2026-10-31')).toBe(false);
    expect(payRangeIsWholeMonths('2026-10-01', '2026-10-30')).toBe(false);
  });

  it('keeps the winning absent remark and ignores a remark on a row that lost the day', () => {
    const result = history({
      attendance: [
        { workDate: monday, status: 'ABSENT', remarks: '  no call  ' },
        { workDate: monday, status: 'MISSING_PUNCH', remarks: 'lost punch' },
        { workDate: '2026-10-13', status: 'PRESENT', remarks: 'on time' },
      ],
    });
    expect(result.absentDays).toBe(1);
    expect(result.absentNotes).toEqual([{ date: monday, note: 'no call' }]);
    expect(absentDateRows(result)).toEqual([{ date: monday, note: 'no call' }]);
    expect(result.attendanceDays.find((day) => day.date === '2026-10-13')?.remark).toBe('on time');
  });

  it('does not treat a weekly off remark as an absent note', () => {
    const result = history({
      attendance: [{ workDate: sunday, status: 'ABSENT', remarks: 'rest day' }],
    });
    expect(result.absentDays).toBe(0);
    expect(result.absentNotes).toEqual([]);
    expect(absentDateRows(result)).toEqual([]);
    expect(result.attendanceDays[0]?.remark).toBe('rest day');
  });

  it('puts an approved leave remark on that leave and keeps it off the absent list', () => {
    const result = history({
      leaves: [
        {
          id: 'sick',
          status: 'APPROVED',
          startDate: friday,
          endDate: friday,
          leaveTypeCode: 'SICK',
          leaveTypeName: 'Sick leave',
        },
      ],
      attendance: [{ workDate: friday, status: 'LEAVE', remarks: 'doctor note' }],
    });
    expect(result.absentDays).toBe(0);
    expect(result.absentNotes).toEqual([]);
    expect(absentDateRows(result)).toEqual([]);
    expect(result.leaves[0]?.notes).toEqual([{ date: friday, note: 'doctor note' }]);
  });

  it('does not add a note when the remark is blank', () => {
    const result = history({
      attendance: [{ workDate: monday, status: 'ABSENT', remarks: '   ' }],
    });
    expect(result.absentDays).toBe(1);
    expect(result.absentNotes).toEqual([]);
    expect(result.attendanceDays[0]?.remark).toBeNull();
    expect(absentDateRows(result)).toEqual([{ date: monday, note: '' }]);
  });
});

describe('absenceCountRange', () => {
  const today = '2026-11-16';

  it('uses the selected range when both dates are set', () => {
    expect(
      absenceCountRange({
        hireDate: '2020-01-01',
        terminationDate: null,
        earliestRecordDate: '2019-01-01',
        from: '2026-10-01',
        to: '2026-10-31',
        today,
      })
    ).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('uses hire through today, or termination when that date is already reached', () => {
    expect(
      absenceCountRange({
        hireDate: '2024-03-26',
        terminationDate: null,
        earliestRecordDate: '2020-01-01',
        from: null,
        to: null,
        today,
      })
    ).toEqual({ from: '2024-03-26', to: today });
    expect(
      absenceCountRange({
        hireDate: '2024-03-26',
        terminationDate: '2026-10-01',
        earliestRecordDate: null,
        from: null,
        to: null,
        today,
      })
    ).toEqual({ from: '2024-03-26', to: '2026-10-01' });
  });

  it('starts at the earliest record when there is no hire date, and counts a future hire as empty', () => {
    expect(
      absenceCountRange({
        hireDate: null,
        terminationDate: null,
        earliestRecordDate: '2025-02-01',
        from: null,
        to: null,
        today,
      })
    ).toEqual({ from: '2025-02-01', to: today });
    expect(
      absenceCountRange({
        hireDate: '2026-12-01',
        terminationDate: null,
        earliestRecordDate: null,
        from: null,
        to: null,
        today,
      })
    ).toBeNull();
  });
});
