import { computeEmployeeTenure, tenureLabel } from '@/lib/hr/employeeTenure';

describe('employeeTenure', () => {
  const refDate = new Date(2026, 7, 27); // 2026-08-27

  describe('computeEmployeeTenure', () => {
    it('returns null for null or invalid date', () => {
      expect(computeEmployeeTenure(null, refDate)).toBeNull();
      expect(computeEmployeeTenure(undefined, refDate)).toBeNull();
      expect(computeEmployeeTenure('', refDate)).toBeNull();
      expect(computeEmployeeTenure('invalid-date', refDate)).toBeNull();
    });

    it('returns 0 totalDays when hire date is today', () => {
      const result = computeEmployeeTenure('2026-08-27', refDate);
      expect(result).toEqual({
        years: 0,
        months: 0,
        days: 0,
        totalDays: 0,
        isFuture: false,
        isExited: false,
      });
    });

    it('returns 1 day when hire date was yesterday', () => {
      const result = computeEmployeeTenure('2026-08-26', refDate);
      expect(result).toEqual({
        years: 0,
        months: 0,
        days: 1,
        totalDays: 1,
        isFuture: false,
        isExited: false,
      });
    });

    it('handles ISO string dates with timezone offset without day shifting', () => {
      const result = computeEmployeeTenure('2026-08-26T00:00:00.000Z', refDate);
      expect(result).toEqual({
        years: 0,
        months: 0,
        days: 1,
        totalDays: 1,
        isFuture: false,
        isExited: false,
      });
    });

    it('returns accurate days across month boundaries', () => {
      // Reference: 2026-08-01
      const aug1 = new Date(2026, 7, 1);
      const result = computeEmployeeTenure('2026-07-31', aug1);
      expect(result).toEqual({
        years: 0,
        months: 0,
        days: 1,
        totalDays: 1,
        isFuture: false,
        isExited: false,
      });
    });

    it('returns accurate years, months, and days', () => {
      // 2 years, 5 months, 17 days
      const result = computeEmployeeTenure('2024-03-10', refDate);
      expect(result).toEqual({
        years: 2,
        months: 5,
        days: 17,
        totalDays: expect.any(Number),
        isFuture: false,
        isExited: false,
      });
    });

    it('detects future dates', () => {
      const result = computeEmployeeTenure('2026-08-30', refDate);
      expect(result).toEqual({
        years: 0,
        months: 0,
        days: 3,
        totalDays: -3,
        isFuture: true,
        isExited: false,
      });
    });

    it('calculates tenure up to termination date when termination date is in the past', () => {
      // Joined 2024-01-01, terminated 2024-01-02 (1 day) even though today is 2026-08-27
      const result = computeEmployeeTenure('2024-01-01', {
        terminationDate: '2024-01-02',
        referenceDate: refDate,
      });
      expect(result).toEqual({
        years: 0,
        months: 0,
        days: 1,
        totalDays: 1,
        isFuture: false,
        isExited: true,
      });
    });

    it('calculates tenure up to termination date when employee status is EXITED', () => {
      // Joined 2024-01-01, terminated 2024-07-01 (6 months)
      const result = computeEmployeeTenure('2024-01-01', {
        terminationDate: '2024-07-01',
        status: 'EXITED',
        referenceDate: refDate,
      });
      expect(result).toEqual({
        years: 0,
        months: 6,
        days: 0,
        totalDays: 182,
        isFuture: false,
        isExited: true,
      });
    });

    it('calculates tenure up to reference date if termination date is in the future and status is active', () => {
      // Joined 2026-08-01, scheduled to terminate 2026-09-01, reference 2026-08-27 (26 days)
      const result = computeEmployeeTenure('2026-08-01', {
        terminationDate: '2026-09-01',
        status: 'ACTIVE',
        referenceDate: refDate,
      });
      expect(result).toEqual({
        years: 0,
        months: 0,
        days: 26,
        totalDays: 26,
        isFuture: false,
        isExited: false,
      });
    });
  });

  describe('tenureLabel', () => {
    it('returns null for missing hire date', () => {
      expect(tenureLabel(null, refDate)).toBeNull();
    });

    it('shows "Joined today" when hire date is today', () => {
      expect(tenureLabel('2026-08-27', refDate)).toBe('Joined today');
    });

    it('shows "1 day with company" when hire date was yesterday', () => {
      expect(tenureLabel('2026-08-26', refDate)).toBe('1 day with company');
    });

    it('shows "5 days with company" for 5 days ago', () => {
      expect(tenureLabel('2026-08-22', refDate)).toBe('5 days with company');
    });

    it('shows "1 mo. with company" for exactly 1 month', () => {
      expect(tenureLabel('2026-07-27', refDate)).toBe('1 mo. with company');
    });

    it('shows "1 mo. 2 days with company" for 1 month and 2 days', () => {
      expect(tenureLabel('2026-07-25', refDate)).toBe('1 mo. 2 days with company');
    });

    it('shows "1 yr. with company" for exactly 1 year', () => {
      expect(tenureLabel('2025-08-27', refDate)).toBe('1 yr. with company');
    });

    it('shows "2 yrs. with company" for exactly 2 years', () => {
      expect(tenureLabel('2024-08-27', refDate)).toBe('2 yrs. with company');
    });

    it('shows "2 yrs. 5 mos. 17 days with company" for complex tenure', () => {
      expect(tenureLabel('2024-03-10', refDate)).toBe('2 yrs. 5 mos. 17 days with company');
    });

    it('shows "Starts tomorrow" for tomorrow hire date', () => {
      expect(tenureLabel('2026-08-28', refDate)).toBe('Starts tomorrow');
    });

    it('shows "Starts in 3 days" for future hire date', () => {
      expect(tenureLabel('2026-08-30', refDate)).toBe('Starts in 3 days');
    });

    it('calculates actual tenure for exited employee with termination date in the past', () => {
      expect(
        tenureLabel('2024-01-01', {
          terminationDate: '2024-01-02',
          referenceDate: refDate,
        })
      ).toBe('1 day with company');

      expect(
        tenureLabel('2024-01-01', {
          terminationDate: '2024-07-01',
          status: 'EXITED',
          referenceDate: refDate,
        })
      ).toBe('6 mos. with company');

      expect(
        tenureLabel('2023-01-15', {
          terminationDate: '2024-03-20',
          status: 'EXITED',
          referenceDate: refDate,
        })
      ).toBe('1 yr. 2 mos. 5 days with company');
    });

    it('handles exited employee who joined and left on the exact same date', () => {
      expect(
        tenureLabel('2024-05-10', {
          terminationDate: '2024-05-10',
          status: 'EXITED',
          referenceDate: refDate,
        })
      ).toBe('1 day with company');
    });
  });
});
