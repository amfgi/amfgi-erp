import type { Prisma, PrismaClient } from '@prisma/client';

import {
  balanceStorageYear,
  computeLifetimeLeaveEntitlement,
  getLeaveEntitlementConfig,
  prorateAnnualEntitlement,
  resolveLeaveAllocationStartDate,
  type LeaveEntitlementConfig,
} from '@/lib/hr/leaveAllocation';
import {
  parseLeaveTypeRules,
  rolloverUnusedLeaveFromRules,
  summarizeLeaveRules,
  type LeaveTypeRules,
} from '@/lib/hr/leaveTypeRules';
import { countLeaveDaysInclusive, datesInRangeInclusive } from '@/lib/hr/leaveTypes';
import { countLeaveDaysInEntitlementWindow } from '@/lib/hr/payroll/resolveLeavePayForDay';

const LIFETIME_LEAVE_BALANCE_YEAR = 0;

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type LeaveTypeBalanceMode =
  | 'lifetime_accrual'
  | 'yearly_accrual'
  | 'rolling_window'
  | 'usage_only'
  | 'not_tracked';

export type LeaveTypeBalanceRow = {
  leaveTypeId: string;
  code: string;
  name: string;
  balanceMode: LeaveTypeBalanceMode;
  periodLabel: string;
  entitlementDays: number | null;
  usedDays: number;
  adjustedDays: number;
  remainingDays: number | null;
  rulesSummary: string;
};

type LeaveTypeRecord = {
  id: string;
  code: string;
  name: string;
  rules: unknown;
};

type EmployeeAllocationInput = {
  hireDate: Date | null;
  profileExtension: unknown;
  visaPeriods: Array<{ startDate: Date }>;
};

type ApprovedLeaveRequest = {
  leaveTypeId: string | null;
  startDate: Date;
  endDate: Date;
  deductFromBalance: boolean;
};

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveBalanceMode(code: string, rules: LeaveTypeRules): LeaveTypeBalanceMode {
  if (code.toUpperCase() === 'ANNUAL') {
    return rolloverUnusedLeaveFromRules(rules) ? 'lifetime_accrual' : 'yearly_accrual';
  }
  if (rules.entitlementDays) return 'rolling_window';
  return 'usage_only';
}

function countUsedDaysForLeaveType(
  requests: ApprovedLeaveRequest[],
  leaveTypeId: string,
  options?: { calendarYear?: number; deductFromBalanceOnly?: boolean },
): number {
  const total = requests
    .filter((row) => {
      if (row.leaveTypeId !== leaveTypeId) return false;
      if (options?.deductFromBalanceOnly && !row.deductFromBalance) return false;
      if (options?.calendarYear != null && row.startDate.getUTCFullYear() !== options.calendarYear) {
        return false;
      }
      return true;
    })
    .reduce((sum, row) => sum + countLeaveDaysInclusive(row.startDate, row.endDate), 0);
  return Math.round(total * 100) / 100;
}

function rollingWindowUsedDays(
  requests: ApprovedLeaveRequest[],
  leaveTypeId: string,
  entitlementDays: number,
  asOfYmd: string,
): number {
  const rows: Array<{ workDate: Date; leaveTypeId: string | null }> = [];
  const end = new Date(`${asOfYmd}T12:00:00.000Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (entitlementDays - 1));

  for (const req of requests) {
    if (req.leaveTypeId !== leaveTypeId) continue;
    for (const workDate of datesInRangeInclusive(req.startDate, req.endDate)) {
      if (workDate < start || workDate > end) continue;
      rows.push({ workDate, leaveTypeId: req.leaveTypeId });
    }
  }

  return countLeaveDaysInEntitlementWindow(rows, leaveTypeId, asOfYmd, entitlementDays);
}

export function computeLeaveTypeBalanceRow(
  leaveType: LeaveTypeRecord,
  employee: EmployeeAllocationInput,
  requests: ApprovedLeaveRequest[],
  options?: {
    annualAdjustedDays?: number;
    asOfYmd?: string;
    calendarYear?: number;
  },
): LeaveTypeBalanceRow {
  const rules = parseLeaveTypeRules(leaveType.rules);
  const balanceMode = resolveBalanceMode(leaveType.code, rules);
  const asOfYmd = options?.asOfYmd ?? todayYmd();
  const asOfDate = new Date(`${asOfYmd}T12:00:00.000Z`);
  const calendarYear = options?.calendarYear ?? asOfDate.getUTCFullYear();
  const adjustedDays =
    leaveType.code.toUpperCase() === 'ANNUAL' ? (options?.annualAdjustedDays ?? 0) : 0;

  if (balanceMode === 'lifetime_accrual') {
    const allocationStart = resolveLeaveAllocationStartDate(employee);
    const fullEntitlement = rules.entitlementDays && rules.entitlementDays > 0 ? rules.entitlementDays : 30;
    const entitlementDays = computeLifetimeLeaveEntitlement(fullEntitlement, allocationStart, asOfDate);
    const usedDays = countUsedDaysForLeaveType(requests, leaveType.id, { deductFromBalanceOnly: true });
    const remainingDays = Math.max(0, entitlementDays + adjustedDays - usedDays);

    return {
      leaveTypeId: leaveType.id,
      code: leaveType.code,
      name: leaveType.name,
      balanceMode,
      periodLabel: 'Lifetime (from hire / visa)',
      entitlementDays,
      usedDays,
      adjustedDays,
      remainingDays,
      rulesSummary: summarizeLeaveRules(rules),
    };
  }

  if (balanceMode === 'yearly_accrual') {
    const allocationStart = resolveLeaveAllocationStartDate(employee);
    const fullEntitlement = rules.entitlementDays && rules.entitlementDays > 0 ? rules.entitlementDays : 30;
    const entitlementDays = prorateAnnualEntitlement(
      fullEntitlement,
      allocationStart,
      calendarYear,
      asOfDate,
    );
    const usedDays = countUsedDaysForLeaveType(requests, leaveType.id, {
      calendarYear,
      deductFromBalanceOnly: true,
    });
    const remainingDays = Math.max(0, entitlementDays + adjustedDays - usedDays);

    return {
      leaveTypeId: leaveType.id,
      code: leaveType.code,
      name: leaveType.name,
      balanceMode,
      periodLabel: `Calendar year ${calendarYear}`,
      entitlementDays,
      usedDays,
      adjustedDays,
      remainingDays,
      rulesSummary: summarizeLeaveRules(rules),
    };
  }

  if (balanceMode === 'rolling_window' && rules.entitlementDays) {
    const usedDays = rollingWindowUsedDays(requests, leaveType.id, rules.entitlementDays, asOfYmd);
    const remainingDays = Math.max(0, rules.entitlementDays - usedDays);

    return {
      leaveTypeId: leaveType.id,
      code: leaveType.code,
      name: leaveType.name,
      balanceMode,
      periodLabel: `Rolling ${rules.entitlementDays}-day window`,
      entitlementDays: rules.entitlementDays,
      usedDays,
      adjustedDays: 0,
      remainingDays,
      rulesSummary: summarizeLeaveRules(rules),
    };
  }

  const lifetimeUsed = countUsedDaysForLeaveType(requests, leaveType.id);

  return {
    leaveTypeId: leaveType.id,
    code: leaveType.code,
    name: leaveType.name,
    balanceMode: 'usage_only',
    periodLabel: 'All time usage',
    entitlementDays: null,
    usedDays: lifetimeUsed,
    adjustedDays: 0,
    remainingDays: null,
    rulesSummary: summarizeLeaveRules(rules),
  };
}

async function loadAnnualAdjustedByEmployee(
  prisma: PrismaLike,
  companyId: string,
  employeeIds: string[],
  config: LeaveEntitlementConfig,
): Promise<Map<string, number>> {
  const calendarYear = new Date().getUTCFullYear();
  const balanceYear = balanceStorageYear(config, calendarYear);

  const balanceRows = await prisma.leaveBalance.findMany({
    where: {
      companyId,
      year: balanceYear,
      employeeId: { in: employeeIds },
    },
    select: { employeeId: true, adjustedDays: true },
  });

  return new Map(balanceRows.map((row) => [row.employeeId, Number(row.adjustedDays)]));
}

export async function listLeaveTypeBalancesForEmployee(
  prisma: PrismaLike,
  companyId: string,
  employee: EmployeeAllocationInput & { id: string },
  config?: LeaveEntitlementConfig,
): Promise<LeaveTypeBalanceRow[]> {
  const resolvedConfig = config ?? (await getLeaveEntitlementConfig(prisma, companyId));

  const [leaveTypes, requests, adjustedByEmployee] = await Promise.all([
    prisma.leaveType.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, name: true, rules: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.leaveRequest.findMany({
      where: { companyId, employeeId: employee.id, status: 'APPROVED' },
      select: {
        leaveTypeId: true,
        startDate: true,
        endDate: true,
        deductFromBalance: true,
      },
    }),
    loadAnnualAdjustedByEmployee(prisma, companyId, [employee.id], resolvedConfig),
  ]);

  const annualAdjusted = adjustedByEmployee.get(employee.id) ?? 0;
  const calendarYear = new Date().getUTCFullYear();

  return leaveTypes.map((leaveType) =>
    computeLeaveTypeBalanceRow(leaveType, employee, requests, {
      annualAdjustedDays: annualAdjusted,
      calendarYear,
    }),
  );
}

export async function listLeaveTypeBalancesForEmployees(
  prisma: PrismaLike,
  companyId: string,
  employees: Array<EmployeeAllocationInput & { id: string }>,
  config?: LeaveEntitlementConfig,
): Promise<Map<string, LeaveTypeBalanceRow[]>> {
  if (employees.length === 0) return new Map();

  const employeeIds = employees.map((employee) => employee.id);
  const resolvedConfig =
    config ?? (await getLeaveEntitlementConfig(prisma, companyId));
  const calendarYear = new Date().getUTCFullYear();

  const [leaveTypes, requests, adjustedByEmployee] = await Promise.all([
    prisma.leaveType.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, name: true, rules: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.leaveRequest.findMany({
      where: { companyId, employeeId: { in: employeeIds }, status: 'APPROVED' },
      select: {
        employeeId: true,
        leaveTypeId: true,
        startDate: true,
        endDate: true,
        deductFromBalance: true,
      },
    }),
    loadAnnualAdjustedByEmployee(prisma, companyId, employeeIds, resolvedConfig),
  ]);

  const requestsByEmployee = new Map<string, ApprovedLeaveRequest[]>();
  for (const req of requests) {
    const list = requestsByEmployee.get(req.employeeId) ?? [];
    list.push(req);
    requestsByEmployee.set(req.employeeId, list);
  }

  const result = new Map<string, LeaveTypeBalanceRow[]>();
  for (const employee of employees) {
    const employeeRequests = requestsByEmployee.get(employee.id) ?? [];
    const annualAdjusted = adjustedByEmployee.get(employee.id) ?? 0;
    result.set(
      employee.id,
      leaveTypes.map((leaveType) =>
        computeLeaveTypeBalanceRow(leaveType, employee, employeeRequests, {
          annualAdjustedDays: annualAdjusted,
          calendarYear,
        }),
      ),
    );
  }

  return result;
}

/** Primary annual row for summary columns (backward compatible). */
export function primaryAnnualBalanceRow(
  rows: LeaveTypeBalanceRow[],
): LeaveTypeBalanceRow | null {
  return (
    rows.find((row) => row.code.toUpperCase() === 'ANNUAL') ??
    rows.find(
      (row) => row.balanceMode === 'lifetime_accrual' || row.balanceMode === 'yearly_accrual',
    ) ??
    null
  );
}
