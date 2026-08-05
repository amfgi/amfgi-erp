import { parsePayTypeConfig } from '@/lib/hr/payroll/parsePayTypeConfig';

describe('parsePayTypeConfig', () => {
  it('parses daily wage config with OT percent', () => {
    const config = parsePayTypeConfig({
      mode: 'DAILY_WAGE',
      otPercent: 125,
    });
    expect(config).toMatchObject({
      mode: 'DAILY_WAGE',
      otPercent: 125,
      excludedWeekdays: [],
    });
  });

  it('persists empty excluded weekdays for daily wage', () => {
    const config = parsePayTypeConfig({
      mode: 'DAILY_WAGE',
      otPercent: 125,
      excludedWeekdays: [],
    });
    expect(config.excludedWeekdays).toEqual([]);
  });

  it('parses hourly split with excluded weekdays', () => {
    const config = parsePayTypeConfig({
      mode: 'HOURLY_SPLIT',
      excludedWeekdays: [5, 6],
    });
    expect(config.excludedWeekdays).toEqual([5, 6]);
  });

  it('throws on invalid mode', () => {
    expect(() => parsePayTypeConfig({ mode: 'INVALID' })).toThrow(/Invalid pay type config/);
  });

  it('parses SANDWICHED weeklyOffPayRule for every attendance-driven mode', () => {
    const office = parsePayTypeConfig({
      mode: 'MONTHLY_CALENDAR_DEDUCT',
      deductDenominator: 'CALENDAR_DAYS',
      excludedWeekdays: [0],
      weeklyOffPayRule: 'SANDWICHED',
    });
    expect(office.weeklyOffPayRule).toBe('SANDWICHED');
    expect(office.deductDenominator).toBe('CALENDAR_DAYS');

    for (const mode of ['HOURLY_SPLIT', 'DAILY_WAGE']) {
      const config = parsePayTypeConfig({
        mode,
        excludedWeekdays: [0],
        weeklyOffPayRule: 'SANDWICHED',
      });
      expect(config.weeklyOffPayRule).toBe('SANDWICHED');
    }
  });

  it('ignores weeklyOffPayRule for modes that do not pay per attendance day', () => {
    const fixed = parsePayTypeConfig({
      mode: 'MONTHLY_FIXED',
      excludedWeekdays: [0],
      weeklyOffPayRule: 'SANDWICHED',
    });
    expect(fixed.weeklyOffPayRule).toBeUndefined();

    const custom = parsePayTypeConfig({
      mode: 'CUSTOM',
      excludedWeekdays: [0],
      weeklyOffPayRule: 'SANDWICHED',
      formulaScript: 'gross = monthly_basic',
    });
    expect(custom.weeklyOffPayRule).toBeUndefined();
  });
});
