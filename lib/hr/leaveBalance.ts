import type { Prisma, PrismaClient } from '@prisma/client';
import type { LeaveRequestType } from '@prisma/client';

import {
  balanceStorageYear,
  buildLeaveAllocationSummary,
  computeEmployeeLeaveEntitlement,
  getLeaveEntitlementConfig,
  type LeaveAllocationSummary,
  type LeaveEntitlementConfig,
} from '@/lib/hr/leaveAllocation';
import {
  listLeaveTypeBalancesForEmployees,
  listLeaveTypeBalancesForEmployee,
  primaryAnnualBalanceRow,
  type LeaveTypeBalanceRow,
} from '@/lib/hr/leaveTypeBalances';
import { filterLeaveTypesForEmployeePortal } from '@/lib/hr/leaveTypeRules';
import { countLeaveDaysInclusive, usesLeaveBalance } from '@/lib/hr/leaveTypes';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

/** Lifetime balance row per employee when rollover is enabled. */
export const LIFETIME_LEAVE_BALANCE_YEAR = 0;

export function remainingLeaveDays(balance: {
  entitlementDays: { toNumber?: () => number } | number;
  usedDays: { toNumber?: () => number } | number;
  adjustedDays: { toNumber?: () => number } | number;
}): number {
  const entitlement = Number(balance.entitlementDays);
  const used = Number(balance.usedDays);
  const adjusted = Number(balance.adjustedDays);
  return Math.max(0, entitlement + adjusted - used);
}

/** Full-year entitlement days from leave type rules (no employee proration). */
export async function getAnnualEntitlementFromLeaveTypes(
  prisma: PrismaLike,
  companyId: string,
): Promise<number> {
  const config = await getLeaveEntitlementConfig(prisma, companyId);
  return config.fullEntitlementDays;
}

export async function computeLifetimeUsedLeaveDays(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
): Promise<number> {
  const requests = await prisma.leaveRequest.findMany({
    where: {
      companyId,
      employeeId,
      status: 'APPROVED',
      deductFromBalance: true,
    },
    select: {
      leaveType: true,
      startDate: true,
      endDate: true,
      deductFromBalance: true,
    },
  });

  const total = requests.reduce(
    (sum, row) =>
      sum +
      leaveDaysForRequest(row.leaveType, row.startDate, row.endDate, row.deductFromBalance),
    0,
  );
  return Math.round(total * 100) / 100;
}

export async function computeCalendarYearUsedLeaveDays(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
  calendarYear: number,
): Promise<number> {
  const requests = await prisma.leaveRequest.findMany({
    where: {
      companyId,
      employeeId,
      status: 'APPROVED',
      deductFromBalance: true,
      startDate: {
        gte: new Date(Date.UTC(calendarYear, 0, 1)),
        lt: new Date(Date.UTC(calendarYear + 1, 0, 1)),
      },
    },
    select: {
      leaveType: true,
      startDate: true,
      endDate: true,
      deductFromBalance: true,
    },
  });

  const total = requests.reduce(
    (sum, row) =>
      sum +
      leaveDaysForRequest(row.leaveType, row.startDate, row.endDate, row.deductFromBalance),
    0,
  );
  return Math.round(total * 100) / 100;
}

export async function computeUsedLeaveDaysForConfig(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
  config: LeaveEntitlementConfig,
  calendarYear: number,
): Promise<number> {
  if (config.rolloverUnusedLeave) {
    return computeLifetimeUsedLeaveDays(prisma, companyId, employeeId);
  }
  return computeCalendarYearUsedLeaveDays(prisma, companyId, employeeId, calendarYear);
}

async function getAdjustedDaysForBalanceYear(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
  balanceYear: number,
): Promise<number> {
  const row = await prisma.leaveBalance.findUnique({
    where: {
      companyId_employeeId_year: {
        companyId,
        employeeId,
        year: balanceYear,
      },
    },
    select: { adjustedDays: true },
  });
  return row ? Number(row.adjustedDays) : 0;
}

/** @deprecated Migrated adjustments on first lifetime row creation only. */
async function getLifetimeAdjustedDays(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
): Promise<number> {
  const rows = await prisma.leaveBalance.findMany({
    where: { companyId, employeeId },
    select: { adjustedDays: true },
  });
  const total = rows.reduce((sum, row) => sum + Number(row.adjustedDays), 0);
  return Math.round(total * 100) / 100;
}

export async function getOrCreateLeaveBalance(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
  options?: { calendarYear?: number },
) {
  const config = await getLeaveEntitlementConfig(prisma, companyId);
  const calendarYear = options?.calendarYear ?? new Date().getUTCFullYear();
  const balanceYear = balanceStorageYear(config, calendarYear);

  const [entitlementDays, usedDays] = await Promise.all([
    computeEmployeeLeaveEntitlement(prisma, companyId, employeeId, { calendarYear }),
    computeUsedLeaveDaysForConfig(prisma, companyId, employeeId, config, calendarYear),
  ]);

  const existing = await prisma.leaveBalance.findUnique({
    where: {
      companyId_employeeId_year: {
        companyId,
        employeeId,
        year: balanceYear,
      },
    },
  });

  if (existing) {
    const needsUpdate =
      Math.abs(Number(existing.entitlementDays) - entitlementDays) > 0.001 ||
      Math.abs(Number(existing.usedDays) - usedDays) > 0.001;

    if (needsUpdate) {
      return prisma.leaveBalance.update({
        where: { id: existing.id },
        data: { entitlementDays, usedDays },
      });
    }
    return existing;
  }

  const adjustedDays =
    balanceYear === LIFETIME_LEAVE_BALANCE_YEAR
      ? await getLifetimeAdjustedDays(prisma, companyId, employeeId)
      : await getAdjustedDaysForBalanceYear(prisma, companyId, employeeId, balanceYear);

  return prisma.leaveBalance.create({
    data: {
      companyId,
      employeeId,
      year: balanceYear,
      entitlementDays,
      usedDays,
      adjustedDays,
    },
  });
}

export type EmployeePortalLeaveBalance = {
  entitlementDays: number;
  usedDays: number;
  adjustedDays: number;
  remainingDays: number;
  rolloverEnabled: boolean;
  allocation: LeaveAllocationSummary;
  leaveTypeBalances: LeaveTypeBalanceRow[];
};

export async function getEmployeePortalLeaveBalance(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
): Promise<EmployeePortalLeaveBalance | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: {
      id: true,
      hireDate: true,
      profileExtension: true,
      visaPeriods: { select: { startDate: true }, orderBy: { startDate: 'asc' } },
    },
  });
  if (!employee) return null;

  const config = await getLeaveEntitlementConfig(prisma, companyId);
  const [allTypeBalances, visibleLeaveTypes] = await Promise.all([
    listLeaveTypeBalancesForEmployee(prisma, companyId, employee, config),
    prisma.leaveType.findMany({
      where: { companyId, isActive: true },
      select: { id: true, rules: true },
    }),
  ]);

  const visibleIds = new Set(filterLeaveTypesForEmployeePortal(visibleLeaveTypes).map((row) => row.id));
  const leaveTypeBalances = allTypeBalances.filter((row) => visibleIds.has(row.leaveTypeId));
  const annualRow = primaryAnnualBalanceRow(leaveTypeBalances);
  const allocation = buildLeaveAllocationSummary(employee, config);

  const entitlementDays = annualRow?.entitlementDays ?? allocation.computedEntitlementDays;
  const usedDays = annualRow?.usedDays ?? 0;
  const adjustedDays = annualRow?.adjustedDays ?? 0;
  const remainingDays =
    annualRow?.remainingDays ?? Math.max(0, entitlementDays + adjustedDays - usedDays);

  return {
    entitlementDays,
    usedDays,
    adjustedDays,
    remainingDays,
    rolloverEnabled: config.rolloverUnusedLeave,
    allocation,
    leaveTypeBalances,
  };
}

export function leaveDaysForRequest(
  leaveType: LeaveRequestType,
  startDate: Date,
  endDate: Date,
  deductFromBalance: boolean
): number {
  if (!deductFromBalance || !usesLeaveBalance(leaveType)) return 0;
  return countLeaveDaysInclusive(startDate, endDate);
}

export type LeaveBalanceListRow = {
  id: string | null;
  employeeId: string;
  entitlementDays: number;
  usedDays: number;
  adjustedDays: number;
  remainingDays: number;
  allocation: LeaveAllocationSummary;
  leaveTypeBalances: LeaveTypeBalanceRow[];
  employee: {
    id: string;
    fullName: string;
    preferredName: string | null;
    employeeCode: string;
    hireDate: string | null;
    status: string;
  };
};

function toIsoDate(value: Date | null | undefined): string | null {
  if (!value || !(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function buildLeaveBalanceListRow(
  employee: {
    id: string;
    fullName: string;
    preferredName: string | null;
    employeeCode: string;
    hireDate: Date | null;
    status: string;
    profileExtension: unknown;
    visaPeriods: Array<{ startDate: Date }>;
  },
  config: LeaveEntitlementConfig,
  stored: { id: string; adjustedDays: { toNumber?: () => number } | number } | null | undefined,
  usedDays: number,
  leaveTypeBalances: LeaveTypeBalanceRow[],
): LeaveBalanceListRow {
  const allocation = buildLeaveAllocationSummary(employee, config);
  const annualRow = primaryAnnualBalanceRow(leaveTypeBalances);
  const entitlementDays = annualRow?.entitlementDays ?? allocation.computedEntitlementDays;
  const adjustedDays = annualRow?.adjustedDays ?? (stored ? Number(stored.adjustedDays) : 0);
  const rowUsedDays = annualRow?.usedDays ?? usedDays;
  const remainingDays = annualRow?.remainingDays ?? Math.max(0, entitlementDays + adjustedDays - rowUsedDays);

  return {
    id: stored?.id ?? null,
    employeeId: employee.id,
    entitlementDays,
    usedDays: rowUsedDays,
    adjustedDays,
    remainingDays,
    allocation,
    leaveTypeBalances,
    employee: {
      id: employee.id,
      fullName: employee.fullName,
      preferredName: employee.preferredName,
      employeeCode: employee.employeeCode,
      hireDate: toIsoDate(employee.hireDate),
      status: employee.status,
    },
  };
}

export async function listLeaveBalances(
  prisma: PrismaLike,
  companyId: string,
  options?: { employeeId?: string; includeAllEmployees?: boolean },
): Promise<LeaveBalanceListRow[]> {
  const config = await getLeaveEntitlementConfig(prisma, companyId);
  const calendarYear = new Date().getUTCFullYear();
  const balanceYear = balanceStorageYear(config, calendarYear);

  if (options?.includeAllEmployees) {
    const employees = await prisma.employee.findMany({
      where: {
        companyId,
        status: { in: ['ACTIVE', 'ON_LEAVE'] },
        ...(options.employeeId ? { id: options.employeeId } : {}),
      },
      select: {
        id: true,
        fullName: true,
        preferredName: true,
        employeeCode: true,
        hireDate: true,
        status: true,
        profileExtension: true,
        visaPeriods: { select: { startDate: true }, orderBy: { startDate: 'asc' } },
      },
      orderBy: { fullName: 'asc' },
    });

    const [balanceRows, usedByEmployee] = await Promise.all([
      prisma.leaveBalance.findMany({
        where: {
          companyId,
          year: balanceYear,
          employeeId: { in: employees.map((employee) => employee.id) },
        },
      }),
      Promise.all(
        employees.map(async (employee) => ({
          employeeId: employee.id,
          usedDays: await computeUsedLeaveDaysForConfig(
            prisma,
            companyId,
            employee.id,
            config,
            calendarYear,
          ),
        })),
      ),
    ]);

    const balanceByEmployeeId = new Map(balanceRows.map((row) => [row.employeeId, row]));
    const usedByEmployeeId = new Map(usedByEmployee.map((row) => [row.employeeId, row.usedDays]));
    const leaveTypeBalancesByEmployee = await listLeaveTypeBalancesForEmployees(
      prisma,
      companyId,
      employees,
      config,
    );

    return employees.map((employee) =>
      buildLeaveBalanceListRow(
        employee,
        config,
        balanceByEmployeeId.get(employee.id),
        usedByEmployeeId.get(employee.id) ?? 0,
        leaveTypeBalancesByEmployee.get(employee.id) ?? [],
      ),
    );
  }

  const rows = await prisma.leaveBalance.findMany({
    where: {
      companyId,
      year: balanceYear,
      ...(options?.employeeId ? { employeeId: options.employeeId } : {}),
    },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          preferredName: true,
          employeeCode: true,
          hireDate: true,
          status: true,
          profileExtension: true,
          visaPeriods: { select: { startDate: true }, orderBy: { startDate: 'asc' } },
        },
      },
    },
    orderBy: { employee: { fullName: 'asc' } },
  });

  return Promise.all(
    rows.map(async (row) => {
      const leaveTypeBalances = await listLeaveTypeBalancesForEmployees(prisma, companyId, [row.employee], config);
      return buildLeaveBalanceListRow(
        row.employee,
        config,
        row,
        await computeUsedLeaveDaysForConfig(
          prisma,
          companyId,
          row.employeeId,
          config,
          calendarYear,
        ),
        leaveTypeBalances.get(row.employeeId) ?? [],
      );
    }),
  );
}

/** @deprecated Use listLeaveBalances. */
export async function listLeaveBalancesForYear(
  prisma: PrismaLike,
  companyId: string,
  _year: number,
  options?: { employeeId?: string; includeAllEmployees?: boolean },
): Promise<LeaveBalanceListRow[]> {
  return listLeaveBalances(prisma, companyId, options);
}

export async function recalculateLeaveBalanceEntitlement(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
) {
  const balance = await getOrCreateLeaveBalance(prisma, companyId, employeeId);
  const entitlementDays = await computeEmployeeLeaveEntitlement(prisma, companyId, employeeId, {
    calendarYear: balance.year === LIFETIME_LEAVE_BALANCE_YEAR ? undefined : balance.year,
  });
  return prisma.leaveBalance.update({
    where: { id: balance.id },
    data: { entitlementDays },
  });
}

export async function applyLeaveBalanceAdjustment(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
  adjustmentDelta: number,
) {
  const balance = await getOrCreateLeaveBalance(prisma, companyId, employeeId);
  const nextAdjusted = Number(balance.adjustedDays) + adjustmentDelta;
  return prisma.leaveBalance.update({
    where: { id: balance.id },
    data: { adjustedDays: nextAdjusted },
  });
}

export async function assertSufficientLeaveBalance(
  prisma: PrismaLike,
  params: {
    companyId: string;
    employeeId: string;
    daysNeeded: number;
    allowOverride?: boolean;
    leaveCalendarYear?: number;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (params.allowOverride) return { ok: true };
  const balance = await getOrCreateLeaveBalance(prisma, params.companyId, params.employeeId, {
    calendarYear: params.leaveCalendarYear,
  });
  const remaining = remainingLeaveDays(balance);
  if (params.daysNeeded > remaining) {
    return {
      ok: false,
      message: `Insufficient annual leave balance (${remaining} day(s) remaining, ${params.daysNeeded} requested)`,
    };
  }
  return { ok: true };
}
