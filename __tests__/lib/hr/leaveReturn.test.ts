import { assessLeaveReturn } from '@/lib/hr/leaveReturn';

const friday = '2026-10-09';
const saturday = '2026-10-10';
const sunday = '2026-10-11';
const monday = '2026-10-12';
const tuesday = '2026-10-13';

function assess(
  overrides: Partial<Parameters<typeof assessLeaveReturn>[0]> & Pick<Parameters<typeof assessLeaveReturn>[0], 'today'>
) {
  return assessLeaveReturn({
    status: 'APPROVED',
    endDate: friday,
    attendance: [],
    ...overrides,
  });
}

describe('assessLeaveReturn', () => {
  it('ignores leave that is not approved', () => {
    expect(
      assess({
        status: 'PENDING',
        today: monday,
        attendance: [{ workDate: monday, status: 'PRESENT' }],
      })
    ).toEqual({ returnDate: null, returnResult: null, extraDays: null });
  });

  it('stays on leave through the approved end date', () => {
    expect(assess({ today: friday }).returnResult).toBe('STILL_ON_LEAVE');
  });

  it('is on time when the next present day has no absent working day before it', () => {
    expect(
      assess({
        today: monday,
        attendance: [{ workDate: monday, status: 'PRESENT' }],
      })
    ).toEqual({ returnDate: monday, returnResult: 'ON_TIME', extraDays: 0 });
  });

  it('does not count an unmarked Saturday before Monday as an extra day', () => {
    expect(
      assess({
        today: monday,
        attendance: [{ workDate: monday, status: 'HALF_DAY' }],
      }).extraDays
    ).toBe(0);
  });

  it('counts a marked absent working day before the return as late', () => {
    expect(
      assess({
        today: monday,
        attendance: [
          { workDate: saturday, status: 'ABSENT' },
          { workDate: monday, status: 'PRESENT' },
        ],
      })
    ).toEqual({ returnDate: monday, returnResult: 'LATE', extraDays: 1 });
  });

  it('skips Sunday when it is the weekly off', () => {
    expect(
      assess({
        today: tuesday,
        attendance: [
          { workDate: sunday, status: 'ABSENT' },
          { workDate: monday, status: 'ABSENT' },
          { workDate: tuesday, status: 'PRESENT' },
        ],
      })
    ).toEqual({ returnDate: tuesday, returnResult: 'LATE', extraDays: 1 });
  });

  it('treats a present weekly off as the return', () => {
    expect(
      assess({
        today: monday,
        attendance: [{ workDate: sunday, status: 'PRESENT' }],
      })
    ).toEqual({ returnDate: sunday, returnResult: 'ON_TIME', extraDays: 0 });
  });

  it('uses the weekdays excluded on that date', () => {
    expect(
      assess({
        today: monday,
        excludedWeekdaysForDate: (workDate) => (workDate === saturday ? [6] : [0]),
        attendance: [
          { workDate: saturday, status: 'ABSENT' },
          { workDate: monday, status: 'PRESENT' },
        ],
      }).extraDays
    ).toBe(0);
  });

  it('does not skip every weekday when the pay package excludes all of them', () => {
    expect(
      assess({
        today: monday,
        excludedWeekdaysForDate: () => [0, 1, 2, 3, 4, 5, 6],
        attendance: [
          { workDate: sunday, status: 'ABSENT' },
          { workDate: monday, status: 'PRESENT' },
        ],
      }).extraDays
    ).toBe(1);
  });

  it('is not returned while later working days stay absent', () => {
    expect(
      assess({
        today: monday,
        attendance: [
          { workDate: saturday, status: 'LEAVE' },
          { workDate: monday, status: 'ABSENT' },
        ],
      })
    ).toEqual({ returnDate: null, returnResult: 'NOT_RETURNED', extraDays: 2 });
  });

  it('is not marked when no later working day has attendance', () => {
    expect(assess({ today: tuesday })).toEqual({
      returnDate: null,
      returnResult: 'NOT_MARKED',
      extraDays: null,
    });
  });

  it('ignores a missing punch', () => {
    expect(
      assess({
        today: monday,
        attendance: [{ workDate: saturday, status: 'MISSING_PUNCH' }],
      }).returnResult
    ).toBe('NOT_MARKED');
  });

  it('ignores present rows inside the approved dates', () => {
    expect(
      assess({
        today: monday,
        attendance: [
          { workDate: friday, status: 'PRESENT' },
          { workDate: monday, status: 'PRESENT' },
        ],
      }).returnDate
    ).toBe(monday);
  });

  it('does not treat a present day after the next leave as a return from this one', () => {
    expect(
      assess({
        today: '2026-10-15',
        otherApprovedLeave: [{ startDate: monday, endDate: tuesday }],
        attendance: [{ workDate: '2026-10-15', status: 'PRESENT' }],
      })
    ).toEqual({ returnDate: null, returnResult: 'ANOTHER_LEAVE', extraDays: 0 });
  });

  it('calls a following leave another leave instead of a return', () => {
    expect(
      assess({
        today: monday,
        otherApprovedLeave: [{ startDate: monday, endDate: tuesday }],
        attendance: [{ workDate: monday, status: 'PRESENT' }],
      })
    ).toEqual({ returnDate: null, returnResult: 'ANOTHER_LEAVE', extraDays: 0 });
  });

  it('keeps absent days that happened before the next leave', () => {
    expect(
      assess({
        today: monday,
        otherApprovedLeave: [{ startDate: monday, endDate: tuesday }],
        attendance: [{ workDate: saturday, status: 'ABSENT' }],
      })
    ).toEqual({ returnDate: null, returnResult: 'NOT_RETURNED', extraDays: 1 });
  });

  it('lists extra dates only when the history report asks for them', () => {
    const hidden = assess({
      today: monday,
      attendance: [
        { workDate: saturday, status: 'ABSENT' },
        { workDate: monday, status: 'PRESENT' },
      ],
    });
    expect(hidden).toEqual({ returnDate: monday, returnResult: 'LATE', extraDays: 1 });
    expect('extraDates' in hidden).toBe(false);

    const shown = assessLeaveReturn({
      status: 'APPROVED',
      endDate: friday,
      today: monday,
      attendance: [
        { workDate: saturday, status: 'ABSENT' },
        { workDate: monday, status: 'PRESENT' },
      ],
      includeExtraDates: true,
    });
    expect(shown.extraDates).toEqual([saturday]);
  });
});
