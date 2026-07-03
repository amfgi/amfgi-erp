import {
  computeAnnualLeaveEntitlement,
  countAccrualMonthsInYear,
  computeLifetimeLeaveEntitlement,
  countLifetimeAccrualMonths,
  daysPerMonthFromAnnualEntitlement,
  describeLeaveAllocationAnchor,
  prorateAnnualEntitlement,
  resolveLeaveAllocationStartDate,
} from '@/lib/hr/leaveAllocation';

describe('leaveAllocation', () => {
  it('uses hire date when no company visa periods exist', () => {
    const hireDate = new Date('2024-03-15T00:00:00.000Z');
    const start = resolveLeaveAllocationStartDate({
      hireDate,
      profileExtension: { workforce: { visaHolding: 'COMPANY_PROVIDED' } },
      visaPeriods: [],
    });
    expect(start?.toISOString().slice(0, 10)).toBe('2024-03-15');
  });

  it('always uses oldest visa start for company-provided visa', () => {
    const start = resolveLeaveAllocationStartDate({
      hireDate: new Date('2024-06-01T00:00:00.000Z'),
      profileExtension: { workforce: { visaHolding: 'COMPANY_PROVIDED' } },
      visaPeriods: [
        { startDate: new Date('2022-08-01T00:00:00.000Z') },
        { startDate: new Date('2020-05-10T00:00:00.000Z') },
      ],
    });
    expect(start?.toISOString().slice(0, 10)).toBe('2020-05-10');
  });

  it('uses hire date for self own visa even when visa periods exist', () => {
    const hireDate = new Date('2024-01-20T00:00:00.000Z');
    const start = resolveLeaveAllocationStartDate({
      hireDate,
      profileExtension: { workforce: { visaHolding: 'SELF_OWN' } },
      visaPeriods: [{ startDate: new Date('2020-05-10T00:00:00.000Z') }],
    });
    expect(start?.toISOString().slice(0, 10)).toBe('2024-01-20');
  });

  it('derives 2.5 days per month from 30-day annual entitlement', () => {
    expect(daysPerMonthFromAnnualEntitlement(30)).toBe(2.5);
  });

  it('accrues lifetime months from anchor through as-of date', () => {
    expect(
      countLifetimeAccrualMonths(
        new Date('2020-05-10T00:00:00.000Z'),
        new Date('2020-07-01T00:00:00.000Z'),
      ),
    ).toBe(3);
    expect(
      computeLifetimeLeaveEntitlement(
        30,
        new Date('2020-05-10T00:00:00.000Z'),
        new Date('2021-04-30T00:00:00.000Z'),
      ),
    ).toBe(30);
  });

  it('accrues different lifetime totals for different hire dates', () => {
    const asOf = new Date('2026-07-01T00:00:00.000Z');
    expect(
      computeLifetimeLeaveEntitlement(30, new Date('2024-01-01T00:00:00.000Z'), asOf),
    ).toBeGreaterThan(
      computeLifetimeLeaveEntitlement(30, new Date('2026-01-01T00:00:00.000Z'), asOf),
    );
  });

  it('returns zero lifetime entitlement when anchor is missing', () => {
    expect(countLifetimeAccrualMonths(null, new Date('2026-12-31T00:00:00.000Z'))).toBe(0);
    expect(
      computeLifetimeLeaveEntitlement(30, null, new Date('2026-12-31T00:00:00.000Z')),
    ).toBe(0);
  });

  it('accrues monthly through December when anchor is before the year', () => {
    expect(
      prorateAnnualEntitlement(
        30,
        new Date('2023-01-01T00:00:00.000Z'),
        2026,
        new Date('2026-12-31T00:00:00.000Z'),
      ),
    ).toBe(30);
  });

  it('describes company visa allocation anchor', () => {
    const summary = describeLeaveAllocationAnchor({
      hireDate: new Date('2024-06-01T00:00:00.000Z'),
      profileExtension: { workforce: { visaHolding: 'COMPANY_PROVIDED' } },
      visaPeriods: [{ startDate: new Date('2020-05-10T00:00:00.000Z') }],
    });
    expect(summary.allocationLabel).toBe('Company visa start (visa & contract)');
    expect(summary.allocationStart?.toISOString().slice(0, 10)).toBe('2020-05-10');
    expect(summary.visaHolding).toBe('COMPANY_PROVIDED');
  });

  it('describes hire date allocation for self own visa', () => {
    const summary = describeLeaveAllocationAnchor({
      hireDate: new Date('2024-01-20T00:00:00.000Z'),
      profileExtension: { workforce: { visaHolding: 'SELF_OWN' } },
      visaPeriods: [{ startDate: new Date('2020-05-10T00:00:00.000Z') }],
    });
    expect(summary.allocationLabel).toBe('Hire date');
    expect(summary.allocationStart?.toISOString().slice(0, 10)).toBe('2024-01-20');
  });

  it('ignores invalid hire and visa dates', () => {
    const invalid = new Date('not-a-date');
    expect(
      resolveLeaveAllocationStartDate({
        hireDate: invalid,
        profileExtension: { workforce: { visaHolding: 'COMPANY_PROVIDED' } },
        visaPeriods: [{ startDate: invalid }],
      }),
    ).toBeNull();
    expect(
      computeLifetimeLeaveEntitlement(30, invalid, new Date('2026-12-31T00:00:00.000Z')),
    ).toBe(0);
  });

  it('uses yearly accrual when rollover is disabled', () => {
    const config = {
      fullEntitlementDays: 30,
      allocationBasis: 'OLDEST_VISA_OR_HIRE' as const,
      rolloverUnusedLeave: false,
    };
    const employee = {
      hireDate: new Date('2024-01-01T00:00:00.000Z'),
      profileExtension: { workforce: { visaHolding: 'SELF_OWN' } },
      visaPeriods: [] as Array<{ startDate: Date }>,
    };
    expect(
      computeAnnualLeaveEntitlement(config, employee, {
        calendarYear: 2026,
        asOfDate: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).toBe(17.5);
    expect(
      computeAnnualLeaveEntitlement(config, employee, {
        calendarYear: 2024,
        asOfDate: new Date('2024-06-01T00:00:00.000Z'),
      }),
    ).toBeLessThan(30);
  });
});
