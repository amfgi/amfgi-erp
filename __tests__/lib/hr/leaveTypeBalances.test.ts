import { computeLeaveTypeBalanceRow } from '@/lib/hr/leaveTypeBalances';

describe('leaveTypeBalances', () => {
  const employee = {
    hireDate: new Date('2024-01-01T00:00:00.000Z'),
    profileExtension: { workforce: { visaHolding: 'SELF_OWN' } },
    visaPeriods: [] as Array<{ startDate: Date }>,
  };

  it('computes lifetime annual balance from rules', () => {
    const row = computeLeaveTypeBalanceRow(
      {
        id: 'annual-id',
        code: 'ANNUAL',
        name: 'Annual leave',
        rules: {
          entitlementDays: 30,
          deductFromBalance: true,
        },
      },
      employee,
      [
        {
          leaveTypeId: 'annual-id',
          startDate: new Date('2025-06-01T00:00:00.000Z'),
          endDate: new Date('2025-06-03T00:00:00.000Z'),
          deductFromBalance: true,
        },
      ],
      { asOfYmd: '2026-07-01' },
    );

    expect(row.balanceMode).toBe('lifetime_accrual');
    expect(row.periodLabel).toContain('Lifetime');
    expect(row.usedDays).toBe(3);
    expect(row.entitlementDays).toBeGreaterThan(30);
    expect(row.remainingDays).toBeGreaterThan(0);
  });

  it('computes rolling sick leave window from rules', () => {
    const row = computeLeaveTypeBalanceRow(
      {
        id: 'sick-id',
        code: 'SICK',
        name: 'Sick leave',
        rules: {
          entitlementDays: 90,
          requiresProbationComplete: true,
        },
      },
      employee,
      [
        {
          leaveTypeId: 'sick-id',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          endDate: new Date('2026-06-02T00:00:00.000Z'),
          deductFromBalance: false,
        },
      ],
      { asOfYmd: '2026-07-01' },
    );

    expect(row.balanceMode).toBe('rolling_window');
    expect(row.entitlementDays).toBe(90);
    expect(row.usedDays).toBe(2);
    expect(row.remainingDays).toBe(88);
  });

  it('shows usage-only for types without entitlement', () => {
    const row = computeLeaveTypeBalanceRow(
      {
        id: 'paid-id',
        code: 'PAID',
        name: 'Paid leave',
        rules: { countsAsPaidLeave: true },
      },
      employee,
      [
        {
          leaveTypeId: 'paid-id',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-01-01T00:00:00.000Z'),
          deductFromBalance: false,
        },
      ],
    );

    expect(row.balanceMode).toBe('usage_only');
    expect(row.entitlementDays).toBeNull();
    expect(row.remainingDays).toBeNull();
    expect(row.usedDays).toBe(1);
  });

  it('computes yearly annual balance when rollover is disabled', () => {
    const row = computeLeaveTypeBalanceRow(
      {
        id: 'annual-id',
        code: 'ANNUAL',
        name: 'Annual leave',
        rules: {
          entitlementDays: 30,
          deductFromBalance: true,
          rolloverUnusedLeave: false,
        },
      },
      employee,
      [
        {
          leaveTypeId: 'annual-id',
          startDate: new Date('2025-06-01T00:00:00.000Z'),
          endDate: new Date('2025-06-03T00:00:00.000Z'),
          deductFromBalance: true,
        },
        {
          leaveTypeId: 'annual-id',
          startDate: new Date('2024-06-01T00:00:00.000Z'),
          endDate: new Date('2024-06-05T00:00:00.000Z'),
          deductFromBalance: true,
        },
      ],
      { asOfYmd: '2026-07-01', calendarYear: 2026 },
    );

    expect(row.balanceMode).toBe('yearly_accrual');
    expect(row.periodLabel).toContain('2026');
    expect(row.usedDays).toBe(0);
    expect(row.entitlementDays).toBe(17.5);
  });
});
