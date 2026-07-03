import type { Prisma, PrismaClient } from '@prisma/client';

import {
  type LeaveAllocationBasis,
  parseLeaveTypeRules,
  rolloverUnusedLeaveFromRules,
} from '@/lib/hr/leaveTypeRules';
import {
  parseWorkforceProfile,
  type WorkforceVisaHolding,
  WORKFORCE_VISA_HOLDING_OPTIONS,
} from '@/lib/hr/workforceProfile';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type EmployeeAllocationInput = {
  hireDate: Date | null;
  profileExtension: unknown;
  visaPeriods: Array<{ startDate: Date }>;
};

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function startOfUtcDay(value: Date | null | undefined): Date | null {
  if (!isValidDate(value)) return null;
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function toIsoDateString(value: Date | null | undefined): string | null {
  if (!isValidDate(value)) return null;
  return value.toISOString().slice(0, 10);
}

/** Resolve per-employee leave accrual anchor (hire date or oldest company visa start). */
export function resolveLeaveAllocationStartDate(
  employee: EmployeeAllocationInput,
  _basis?: LeaveAllocationBasis,
): Date | null {
  const hireDate = startOfUtcDay(employee.hireDate);
  const profile = parseWorkforceProfile(employee.profileExtension);

  if (profile.visaHolding === 'COMPANY_PROVIDED' && employee.visaPeriods.length > 0) {
    let oldest: Date | null = null;
    for (const visaPeriod of employee.visaPeriods) {
      const start = startOfUtcDay(visaPeriod.startDate);
      if (!start) continue;
      if (!oldest || start < oldest) oldest = start;
    }
    if (oldest) return oldest;
  }

  return hireDate;
}

/** Days accrued per completed month (e.g. 30 annual days → 2.5/month). */
export function daysPerMonthFromAnnualEntitlement(fullEntitlementDays: number): number {
  return fullEntitlementDays / 12;
}

/**
 * Count inclusive calendar months from the allocation anchor through `asOfDate` (employee lifetime).
 */
export function countLifetimeAccrualMonths(
  allocationStart: Date | null,
  asOfDate: Date = new Date(),
): number {
  if (!allocationStart) return 0;

  const anchor = startOfUtcDay(allocationStart);
  const asOf = startOfUtcDay(asOfDate);
  if (!anchor || !asOf) return 0;
  if (asOf < anchor) return 0;

  const startMonth = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth();
  const endMonth = asOf.getUTCFullYear() * 12 + asOf.getUTCMonth();
  return Math.max(0, endMonth - startMonth + 1);
}

/** @deprecated Use countLifetimeAccrualMonths for leave balances. */
export function countAccrualMonthsInYear(
  allocationStart: Date | null,
  year: number,
  asOfDate: Date = new Date(),
): number {
  const asOf = startOfUtcDay(asOfDate);
  if (!asOf) return 0;

  const asOfYear = asOf.getUTCFullYear();
  if (year > asOfYear) return 0;

  const accrualEndMonth = year < asOfYear ? year * 12 + 11 : year * 12 + asOf.getUTCMonth();

  let periodStartMonth: number;
  if (!allocationStart) {
    return 0;
  }

  const anchor = startOfUtcDay(allocationStart);
  if (!anchor) {
    return 0;
  }
  if (anchor.getTime() > Date.UTC(year, 11, 31)) {
    return 0;
  }
  if (anchor.getTime() <= Date.UTC(year, 0, 1)) {
    periodStartMonth = year * 12;
  } else {
    periodStartMonth = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth();
  }

  return Math.max(0, accrualEndMonth - periodStartMonth + 1);
}

/** Lifetime monthly accrual (2.5 days × months since hire / visa start). */
export function computeLifetimeLeaveEntitlement(
  fullEntitlementDays: number,
  allocationStart: Date | null,
  asOfDate: Date = new Date(),
): number {
  if (fullEntitlementDays <= 0) return 0;

  const months = countLifetimeAccrualMonths(allocationStart, asOfDate);
  if (months <= 0) return 0;

  const daysPerMonth = daysPerMonthFromAnnualEntitlement(fullEntitlementDays);
  const accrued = months * daysPerMonth;
  return Math.round(accrued * 100) / 100;
}

/** Monthly accrual entitlement for a calendar year (2.5 days × eligible months). */
export function prorateAnnualEntitlement(
  fullEntitlementDays: number,
  allocationStart: Date | null,
  year: number,
  asOfDate: Date = new Date(),
): number {
  if (fullEntitlementDays <= 0) return 0;

  const months = countAccrualMonthsInYear(allocationStart, year, asOfDate);
  if (months <= 0) return 0;

  const daysPerMonth = daysPerMonthFromAnnualEntitlement(fullEntitlementDays);
  const accrued = months * daysPerMonth;
  return Math.round(accrued * 100) / 100;
}

export type LeaveEntitlementConfig = {
  fullEntitlementDays: number;
  allocationBasis: LeaveAllocationBasis;
  rolloverUnusedLeave: boolean;
};

export function balanceStorageYear(
  config: LeaveEntitlementConfig,
  calendarYear: number = new Date().getUTCFullYear(),
): number {
  return config.rolloverUnusedLeave ? 0 : calendarYear;
}

export function computeAnnualLeaveEntitlement(
  config: LeaveEntitlementConfig,
  employee: EmployeeAllocationInput,
  options?: { calendarYear?: number; asOfDate?: Date },
): number {
  const allocationStart = resolveLeaveAllocationStartDate(employee);
  if (!allocationStart) return 0;

  const asOfDate = options?.asOfDate ?? new Date();
  if (config.rolloverUnusedLeave) {
    return computeLifetimeLeaveEntitlement(config.fullEntitlementDays, allocationStart, asOfDate);
  }

  const calendarYear = options?.calendarYear ?? asOfDate.getUTCFullYear();
  return prorateAnnualEntitlement(
    config.fullEntitlementDays,
    allocationStart,
    calendarYear,
    asOfDate,
  );
}

export async function getLeaveEntitlementConfig(
  prisma: PrismaLike,
  companyId: string,
): Promise<LeaveEntitlementConfig> {
  const annual = await prisma.leaveType.findFirst({
    where: { companyId, code: 'ANNUAL', isActive: true },
    select: { rules: true },
  });
  if (annual) {
    const rules = parseLeaveTypeRules(annual.rules);
    const fullEntitlementDays =
      rules.entitlementDays && rules.entitlementDays > 0 ? rules.entitlementDays : 30;
    return {
      fullEntitlementDays,
      allocationBasis: rules.allocationBasis ?? 'OLDEST_VISA_OR_HIRE',
      rolloverUnusedLeave: rolloverUnusedLeaveFromRules(rules),
    };
  }

  const fallback = await prisma.leaveType.findFirst({
    where: { companyId, isActive: true },
    select: { rules: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (fallback) {
    const rules = parseLeaveTypeRules(fallback.rules);
    if (rules.deductFromBalance && rules.entitlementDays && rules.entitlementDays > 0) {
      return {
        fullEntitlementDays: rules.entitlementDays,
        allocationBasis: rules.allocationBasis ?? 'OLDEST_VISA_OR_HIRE',
        rolloverUnusedLeave: rolloverUnusedLeaveFromRules(rules),
      };
    }
  }

  return { fullEntitlementDays: 30, allocationBasis: 'OLDEST_VISA_OR_HIRE', rolloverUnusedLeave: true };
}

function visaHoldingLabel(visaHolding: WorkforceVisaHolding): string {
  return WORKFORCE_VISA_HOLDING_OPTIONS.find((option) => option.value === visaHolding)?.label ?? visaHolding;
}

export function describeLeaveAllocationAnchor(
  employee: EmployeeAllocationInput,
  _basis?: LeaveAllocationBasis,
): { allocationStart: Date | null; allocationLabel: string; visaHolding: WorkforceVisaHolding } {
  const profile = parseWorkforceProfile(employee.profileExtension);
  const hireDate = startOfUtcDay(employee.hireDate);
  const allocationStart = resolveLeaveAllocationStartDate(employee);

  let allocationLabel: string;
  if (profile.visaHolding === 'COMPANY_PROVIDED') {
    if (allocationStart && hireDate && allocationStart.getTime() !== hireDate.getTime()) {
      allocationLabel = 'Company visa start (visa & contract)';
    } else if (employee.visaPeriods.length > 0) {
      allocationLabel = 'Hire date (visa dates invalid)';
    } else {
      allocationLabel = 'Hire date (no visa period on file)';
    }
  } else {
    allocationLabel = 'Hire date';
  }

  return {
    allocationStart,
    allocationLabel,
    visaHolding: profile.visaHolding,
  };
}

export type LeaveAllocationSummary = {
  allocationStart: string | null;
  allocationLabel: string;
  visaHolding: WorkforceVisaHolding;
  visaHoldingLabel: string;
  fullYearEntitlementDays: number;
  daysPerMonth: number;
  accruedMonths: number;
  computedEntitlementDays: number;
};

export function buildLeaveAllocationSummary(
  employee: EmployeeAllocationInput,
  config: LeaveEntitlementConfig,
  asOfDate: Date = new Date(),
): LeaveAllocationSummary {
  const { allocationStart, allocationLabel, visaHolding } = describeLeaveAllocationAnchor(
    employee,
    config.allocationBasis,
  );
  const daysPerMonth = daysPerMonthFromAnnualEntitlement(config.fullEntitlementDays);
  const calendarYear = asOfDate.getUTCFullYear();
  const accruedMonths = config.rolloverUnusedLeave
    ? countLifetimeAccrualMonths(allocationStart, asOfDate)
    : countAccrualMonthsInYear(allocationStart, calendarYear, asOfDate);
  return {
    allocationStart: toIsoDateString(allocationStart),
    allocationLabel,
    visaHolding,
    visaHoldingLabel: visaHoldingLabel(visaHolding),
    fullYearEntitlementDays: config.fullEntitlementDays,
    daysPerMonth,
    accruedMonths,
    computedEntitlementDays: computeAnnualLeaveEntitlement(config, employee, {
      calendarYear,
      asOfDate,
    }),
  };
}

export async function computeEmployeeLeaveEntitlement(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
  options?: { calendarYear?: number; asOfDate?: Date },
): Promise<number> {
  const [employee, config] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: {
        hireDate: true,
        profileExtension: true,
        visaPeriods: { select: { startDate: true }, orderBy: { startDate: 'asc' } },
      },
    }),
    getLeaveEntitlementConfig(prisma, companyId),
  ]);

  if (!employee) return 0;
  return computeAnnualLeaveEntitlement(config, employee, options);
}
