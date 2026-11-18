import { prisma } from '@/lib/db/prisma';
import { absenceCountRange, buildEmployeeHistory, type HistoryAttendanceRow, type HistoryLeaveRow } from '@/lib/hr/employeeHistory';
import { dubaiTodayYmd } from '@/lib/hr/leaveReturn';
import { parsePayTypeConfig } from '@/lib/hr/payroll/parsePayTypeConfig';
import { resolveExcludedWeekdays } from '@/lib/hr/payroll/payTypeConfigHelpers';
import { resolveCompensationPackageForDate } from '@/lib/hr/payroll/resolveCompensationForPayroll';
import { dateFromYmd } from '@/lib/hr/workDate';

function ymdFromDb(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

type PackageRow = {
  id: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  payType: { config: unknown };
};

export async function loadCompanyAbsenceCounts(input: {
  companyId: string;
  from: string | null;
  to: string | null;
}): Promise<Array<{ employeeId: string; absentDays: number }>> {
  const today = dubaiTodayYmd();
  const rangeEnd = input.to ?? today;
  const toDate = dateFromYmd(rangeEnd);

  const [employees, attendance, leaves, packages, advances, warnings, payLines] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: input.companyId },
      select: { id: true, hireDate: true, terminationDate: true },
    }),
    prisma.attendanceEntry.findMany({
      where: { companyId: input.companyId, workDate: { lte: toDate } },
      select: {
        employeeId: true,
        workDate: true,
        status: true,
        lateMinutes: true,
        earlyLeaveMinutes: true,
        overtimeMinutes: true,
        remarks: true,
      },
    }),
    prisma.leaveRequest.findMany({
      where: { companyId: input.companyId, status: 'APPROVED', startDate: { lte: toDate } },
      select: {
        id: true,
        employeeId: true,
        status: true,
        startDate: true,
        endDate: true,
        leaveType: true,
        leaveTypeRef: { select: { code: true, name: true } },
      },
    }),
    prisma.employeeCompensation.findMany({
      where: { companyId: input.companyId },
      select: {
        id: true,
        employeeId: true,
        effectiveFrom: true,
        effectiveTo: true,
        createdAt: true,
        payType: { select: { config: true } },
      },
    }),
    prisma.employeeAdvance.findMany({
      where: { companyId: input.companyId },
      select: { employeeId: true, advanceDate: true },
    }),
    prisma.employeeWarning.findMany({
      where: { companyId: input.companyId },
      select: { employeeId: true, warningDate: true },
    }),
    prisma.payRunLine.findMany({
      where: { companyId: input.companyId, skipped: false },
      select: { employeeId: true, payRun: { select: { month: true } } },
    }),
  ]);

  const attendanceByEmployee = new Map<string, HistoryAttendanceRow[]>();
  const earliest = new Map<string, string>();
  const remember = (employeeId: string, value: string | null) => {
    if (!value) return;
    const current = earliest.get(employeeId);
    if (!current || value < current) earliest.set(employeeId, value);
  };
  for (const row of attendance) {
    const workDate = ymdFromDb(row.workDate) ?? '';
    remember(row.employeeId, workDate);
    const list = attendanceByEmployee.get(row.employeeId) ?? [];
    list.push({
      workDate,
      status: row.status,
      lateMinutes: row.lateMinutes,
      earlyLeaveMinutes: row.earlyLeaveMinutes,
      overtimeMinutes: row.overtimeMinutes,
      remarks: row.remarks,
    });
    attendanceByEmployee.set(row.employeeId, list);
  }
  const leavesByEmployee = new Map<string, HistoryLeaveRow[]>();
  for (const row of leaves) {
    remember(row.employeeId, ymdFromDb(row.startDate));
    const list = leavesByEmployee.get(row.employeeId) ?? [];
    list.push({
      id: row.id,
      status: row.status,
      startDate: ymdFromDb(row.startDate) ?? '',
      endDate: ymdFromDb(row.endDate) ?? '',
      leaveTypeCode: row.leaveTypeRef?.code ?? null,
      leaveTypeName: row.leaveTypeRef?.name ?? null,
      legacyLeaveType: row.leaveType,
    });
    leavesByEmployee.set(row.employeeId, list);
  }
  const packagesByEmployee = new Map<string, PackageRow[]>();
  for (const row of packages) {
    const list = packagesByEmployee.get(row.employeeId) ?? [];
    list.push(row);
    packagesByEmployee.set(row.employeeId, list);
  }
  for (const row of packages) remember(row.employeeId, ymdFromDb(row.effectiveFrom));
  for (const row of advances) remember(row.employeeId, ymdFromDb(row.advanceDate));
  for (const row of warnings) remember(row.employeeId, ymdFromDb(row.warningDate));
  for (const row of payLines) remember(row.employeeId, row.payRun.month ? `${row.payRun.month}-01` : null);

  return employees.map((employee) => {
    const hireDate = ymdFromDb(employee.hireDate);
    const terminationDate = ymdFromDb(employee.terminationDate);
    const range = absenceCountRange({
      hireDate,
      terminationDate,
      earliestRecordDate: earliest.get(employee.id) ?? null,
      from: input.from,
      to: input.to,
      today,
    });
    if (!range) return { employeeId: employee.id, absentDays: 0 };
    const employeePackages = packagesByEmployee.get(employee.id) ?? [];
    const weekdayCache = new Map<string, number[]>();
    const counts = buildEmployeeHistory({
      from: range.from,
      to: range.to,
      attendance: attendanceByEmployee.get(employee.id) ?? [],
      leaves: leavesByEmployee.get(employee.id) ?? [],
      excludedWeekdaysForDate: (workDate) => {
        const cached = weekdayCache.get(workDate);
        if (cached) return cached;
        const active = resolveCompensationPackageForDate(employeePackages, workDate);
        let days = [0];
        if (active) {
          try {
            days = resolveExcludedWeekdays(parsePayTypeConfig(active.payType.config));
          } catch {
            days = [0];
          }
        }
        weekdayCache.set(workDate, days);
        return days;
      },
    });
    return { employeeId: employee.id, absentDays: counts.absentDays };
  });
}
