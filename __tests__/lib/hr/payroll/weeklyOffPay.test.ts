import {
  annotatePaidWeeklyOffLines,
  isPaidNeighbourDay,
  resolvePaidWeeklyOffDates,
} from '@/lib/hr/payroll/weeklyOffPay';
import type { PayLineInput, PayTypeConfig } from '@/lib/hr/payroll/types';

function line(
  workDate: string,
  status: string,
  extras: Partial<PayLineInput> = {}
): PayLineInput {
  return {
    workDate,
    status,
    leaveType: null,
    basicHours: 8,
    workedMinutes: status === 'PRESENT' || status === 'HALF_DAY' ? 8 * 60 : 0,
    isSunday: workDate.endsWith('-05') || workDate.endsWith('-12') || workDate.endsWith('-19') || workDate.endsWith('-26'),
    ...extras,
  };
}

const sandwichedConfig: PayTypeConfig = {
  mode: 'MONTHLY_CALENDAR_DEDUCT',
  deductDenominator: 'CALENDAR_DAYS',
  excludedWeekdays: [0],
  weeklyOffPayRule: 'SANDWICHED',
};

describe('resolvePaidWeeklyOffDates', () => {
  it('returns empty when rule is NONE', () => {
    const dates = resolvePaidWeeklyOffDates(
      [line('2026-07-04', 'PRESENT'), line('2026-07-05', 'ABSENT'), line('2026-07-06', 'PRESENT')],
      { ...sandwichedConfig, weeklyOffPayRule: undefined }
    );
    expect([...dates]).toEqual([]);
  });

  it('pays Sunday when both neighbours are present (Sabbir July shape)', () => {
    const lines = [
      line('2026-07-01', 'PRESENT'),
      line('2026-07-02', 'PRESENT'),
      line('2026-07-03', 'PRESENT'),
      line('2026-07-04', 'PRESENT'),
      line('2026-07-05', 'ABSENT'),
      line('2026-07-06', 'PRESENT'),
      line('2026-07-07', 'PRESENT'),
      line('2026-07-08', 'PRESENT'),
      line('2026-07-12', 'ABSENT'),
      line('2026-07-19', 'ABSENT'),
      line('2026-07-26', 'ABSENT'),
    ];
    const dates = resolvePaidWeeklyOffDates(lines, sandwichedConfig);
    expect([...dates].sort()).toEqual(['2026-07-05']);
  });

  it('does not pay Sunday when there is no paid day after it', () => {
    const lines = [
      line('2026-07-04', 'PRESENT'),
      line('2026-07-05', 'ABSENT'),
      line('2026-07-06', 'ABSENT'),
    ];
    expect([...resolvePaidWeeklyOffDates(lines, sandwichedConfig)]).toEqual([]);
  });

  it('pays Sunday when an unpaid Saturday sits between Friday and Monday work (Farha Aug shape)', () => {
    // Sat absent must not block Sunday if work continues on both sides of the week.
    const lines = [
      line('2026-08-14', 'PRESENT'), // Fri
      line('2026-08-15', 'ABSENT'), // Sat
      line('2026-08-16', 'ABSENT', { isSunday: true }), // Sun
      line('2026-08-17', 'PRESENT', { isSunday: false }), // Mon
    ];
    expect([...resolvePaidWeeklyOffDates(lines, sandwichedConfig)]).toEqual(['2026-08-16']);
  });

  it('does not pay Sunday inside a trailing unpaid stretch with no return to work', () => {
    const lines = [
      line('2026-08-19', 'PRESENT'),
      line('2026-08-20', 'ABSENT'),
      line('2026-08-21', 'ABSENT'),
      line('2026-08-22', 'ABSENT'),
      line('2026-08-23', 'ABSENT', { isSunday: true }),
      line('2026-08-24', 'ABSENT', { isSunday: false }),
    ];
    expect([...resolvePaidWeeklyOffDates(lines, sandwichedConfig)]).toEqual([]);
  });

  it('pays Sunday at month start when Monday is present (Faseela Aug shape)', () => {
    // Sat 1 absent, Sun 2, Mon 3 present — Sunday is paid even with no paid day before it.
    const lines = [
      line('2026-08-01', 'ABSENT', { isSunday: false }),
      line('2026-08-02', 'ABSENT', { isSunday: true }),
      line('2026-08-03', 'PRESENT', { isSunday: false }),
    ];
    expect([...resolvePaidWeeklyOffDates(lines, sandwichedConfig)]).toEqual(['2026-08-02']);
  });

  it('does not pay an early Sunday when the next working day is still unpaid', () => {
    // First present is much later — Sun 2 is not adjacent to the start of work.
    const lines = [
      line('2026-08-01', 'ABSENT', { isSunday: false }),
      line('2026-08-02', 'ABSENT', { isSunday: true }),
      line('2026-08-03', 'ABSENT', { isSunday: false }),
      line('2026-08-17', 'PRESENT', { isSunday: false }),
    ];
    expect([...resolvePaidWeeklyOffDates(lines, sandwichedConfig)]).toEqual([]);
  });

  it('pays month-edge Sunday when only one neighbour exists and it is paid', () => {
    // Sunday July 5 at start of a short span that only has Mon after — wait, Jul 5 has Jul 4 before.
    // Use a Sunday as first day of month with only after neighbour.
    const lines = [
      line('2026-06-01', 'ABSENT', { isSunday: true }), // Monday? June 1 2026 is Monday.
    ];
    // July 2026 starts Wednesday. Use June 2026: June 1 is Monday.
    // Find a Sunday at month start: Aug 2026 starts Saturday. Sept 2026 starts Tuesday.
    // Nov 2026 starts Sunday.
    const nov = [
      line('2026-11-01', 'ABSENT', { isSunday: true }),
      line('2026-11-02', 'PRESENT', { isSunday: false }),
    ];
    const dates = resolvePaidWeeklyOffDates(nov, sandwichedConfig);
    expect([...dates]).toEqual(['2026-11-01']);
  });

  it('does not pay month-edge Sunday when the only neighbour is absent', () => {
    const nov = [
      line('2026-11-01', 'ABSENT', { isSunday: true }),
      line('2026-11-02', 'ABSENT', { isSunday: false }),
    ];
    expect([...resolvePaidWeeklyOffDates(nov, sandwichedConfig)]).toEqual([]);
  });

  it('treats paid leave as a paid neighbour', () => {
    const lines = [
      line('2026-07-04', 'ABSENT', {
        leaveType: 'SICK',
        leaveTypeId: 'lt',
        leaveRequestId: 'lr',
        leavePayPercent: 100,
      }),
      line('2026-07-05', 'ABSENT'),
      line('2026-07-06', 'PRESENT'),
    ];
    expect([...resolvePaidWeeklyOffDates(lines, sandwichedConfig)]).toEqual(['2026-07-05']);
  });

  it('skips holiday and leave lines on the weekly off itself', () => {
    const lines = [
      line('2026-07-04', 'PRESENT'),
      line('2026-07-05', 'ABSENT', { isHoliday: true, holidayPaid: true, holidayName: 'Eid' }),
      line('2026-07-06', 'PRESENT'),
    ];
    expect([...resolvePaidWeeklyOffDates(lines, sandwichedConfig)]).toEqual([]);
  });

  it('applies to hourly split and daily wage, not to fixed monthly or custom', () => {
    const lines = [
      line('2026-07-04', 'PRESENT'),
      line('2026-07-05', 'ABSENT'),
      line('2026-07-06', 'PRESENT'),
    ];
    const forMode = (mode: PayTypeConfig['mode']) => [
      ...resolvePaidWeeklyOffDates(lines, { ...sandwichedConfig, mode }),
    ];

    expect(forMode('MONTHLY_CALENDAR_DEDUCT')).toEqual(['2026-07-05']);
    expect(forMode('HOURLY_SPLIT')).toEqual(['2026-07-05']);
    expect(forMode('DAILY_WAGE')).toEqual(['2026-07-05']);
    expect(forMode('MONTHLY_FIXED')).toEqual([]);
    expect(forMode('CUSTOM')).toEqual([]);
  });

  it('leaves a worked weekly off on OT-only pay in hourly and daily wage', () => {
    const lines = [
      line('2026-07-04', 'PRESENT'),
      line('2026-07-05', 'PRESENT'),
      line('2026-07-06', 'PRESENT'),
    ];
    expect([
      ...resolvePaidWeeklyOffDates(lines, { ...sandwichedConfig, mode: 'HOURLY_SPLIT' }),
    ]).toEqual([]);
    expect([
      ...resolvePaidWeeklyOffDates(lines, { ...sandwichedConfig, mode: 'DAILY_WAGE' }),
    ]).toEqual([]);
  });
});

describe('annotatePaidWeeklyOffLines', () => {
  it('stamps isPaidWeeklyOff on matching dates', () => {
    const lines = [
      line('2026-07-04', 'PRESENT'),
      line('2026-07-05', 'ABSENT'),
      line('2026-07-06', 'PRESENT'),
    ];
    const annotated = annotatePaidWeeklyOffLines(lines, sandwichedConfig);
    expect(annotated.find((l) => l.workDate === '2026-07-05')?.isPaidWeeklyOff).toBe(true);
    expect(annotated.find((l) => l.workDate === '2026-07-04')?.isPaidWeeklyOff).toBe(false);
  });
});

describe('isPaidNeighbourDay', () => {
  it('accepts present, half day, paid leave, and paid holiday', () => {
    expect(isPaidNeighbourDay(line('2026-07-01', 'PRESENT'))).toBe(true);
    expect(isPaidNeighbourDay(line('2026-07-01', 'HALF_DAY', { workedMinutes: 240 }))).toBe(true);
    expect(
      isPaidNeighbourDay(
        line('2026-07-01', 'ABSENT', {
          leaveType: 'ANNUAL',
          leaveRequestId: 'lr',
          leavePayPercent: 100,
        })
      )
    ).toBe(true);
    expect(
      isPaidNeighbourDay(line('2026-07-01', 'ABSENT', { isHoliday: true, holidayPaid: true }))
    ).toBe(true);
    expect(isPaidNeighbourDay(line('2026-07-01', 'ABSENT'))).toBe(false);
  });
});
