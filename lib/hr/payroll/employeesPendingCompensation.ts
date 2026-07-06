import { prisma } from '@/lib/db/prisma';
import { monthBounds, monthEndDate } from '@/lib/hr/payroll/calendar';
import { listCompensationPackagesOverlappingMonth } from '@/lib/hr/payroll/resolveCompensationForPayroll';

export type EmployeePendingCompensationRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  preferredName: string | null;
  designation: string | null;
  attendanceRows: number;
  lastAttendanceDate: string;
};

export async function loadEmployeesPendingCompensation(
  companyId: string,
  month: string,
): Promise<EmployeePendingCompensationRow[]> {
  const { start, end } = monthBounds(month);
  const monthEnd = monthEndDate(month);

  const attendanceGroups = await prisma.attendanceEntry.groupBy({
    by: ['employeeId'],
    where: { companyId, workDate: { gte: start, lt: end } },
    _count: { _all: true },
    _max: { workDate: true },
  });

  if (attendanceGroups.length === 0) return [];

  const employeeIds = attendanceGroups.map((group) => group.employeeId);
  const attendanceMeta = new Map(
    attendanceGroups.map((group) => [
      group.employeeId,
      {
        count: group._count._all,
        lastDate: group._max.workDate!,
      },
    ]),
  );

  const compensationRows = await prisma.employeeCompensation.findMany({
    where: {
      companyId,
      employeeId: { in: employeeIds },
      effectiveFrom: { lte: monthEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
    },
    select: {
      id: true,
      employeeId: true,
      effectiveFrom: true,
      effectiveTo: true,
      createdAt: true,
      payType: { select: { isActive: true } },
    },
  });

  const compensationByEmployee = new Map<string, (typeof compensationRows)[number][]>();
  for (const row of compensationRows) {
    const list = compensationByEmployee.get(row.employeeId) ?? [];
    list.push(row);
    compensationByEmployee.set(row.employeeId, list);
  }

  const pendingEmployeeIds = employeeIds.filter((employeeId) => {
    const packages = compensationByEmployee.get(employeeId) ?? [];
    const activePackages = packages.filter((pkg) => pkg.payType.isActive);
    return listCompensationPackagesOverlappingMonth(activePackages, month).length === 0;
  });

  if (pendingEmployeeIds.length === 0) return [];

  const employees = await prisma.employee.findMany({
    where: { companyId, id: { in: pendingEmployeeIds } },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      preferredName: true,
      designation: true,
    },
    orderBy: [{ fullName: 'asc' }],
  });

  return employees.map((employee) => {
    const meta = attendanceMeta.get(employee.id)!;
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      preferredName: employee.preferredName,
      designation: employee.designation,
      attendanceRows: meta.count,
      lastAttendanceDate: meta.lastDate.toISOString().slice(0, 10),
    };
  });
}
