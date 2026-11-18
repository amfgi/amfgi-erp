import { prisma } from '@/lib/db/prisma';
import { buildEmployeeHistory, monthOverlapsRange, payRangeIsWholeMonths } from '@/lib/hr/employeeHistory';
import { assembleEmployeeHistoryReport, type EmployeeHistoryReport } from '@/lib/hr/employeeHistoryReport';
import { displayNationalityCountryName } from '@/lib/hr/countryNames';
import { documentOverlapsHistoryRange } from '@/lib/hr/employeeHistorySections';
import { dubaiTodayYmd } from '@/lib/hr/leaveReturn';
import { tenureLabel } from '@/lib/hr/employeeTenure';
import { parsePayTypeConfig } from '@/lib/hr/payroll/parsePayTypeConfig';
import { resolveExcludedWeekdays } from '@/lib/hr/payroll/payTypeConfigHelpers';
import { resolveCompensationPackageForDate } from '@/lib/hr/payroll/resolveCompensationForPayroll';
import { dateFromYmd } from '@/lib/hr/workDate';

function ymdFromDb(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function dubaiCalendarYmd(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(value);
}

function dubaiReferenceDate(now = new Date()): Date {
  const [year, month, day] = dubaiTodayYmd(now).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function money(value: { toString(): string } | number | null | undefined): number | null {
  if (value == null) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function sumDayField(dayDetails: unknown, key: 'componentDeduction' | 'otHourSalary'): number | null {
  if (!Array.isArray(dayDetails) || dayDetails.length === 0) return null;
  let total = 0;
  let seen = false;
  for (const day of dayDetails) {
    if (!day || typeof day !== 'object' || !(key in day)) continue;
    seen = true;
    const value = Number((day as Record<string, unknown>)[key] ?? 0);
    if (Number.isFinite(value)) total += value;
  }
  if (!seen) return null;
  return Math.round(total * 100) / 100;
}

async function earliestRecordDate(companyId: string, employeeId: string): Promise<string | null> {
  const [attendance, leave, advance, warning, fine, compensation, pay] = await Promise.all([
    prisma.attendanceEntry.findFirst({
      where: { companyId, employeeId },
      orderBy: { workDate: 'asc' },
      select: { workDate: true },
    }),
    prisma.leaveRequest.findFirst({
      where: { companyId, employeeId },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    }),
    prisma.employeeAdvance.findFirst({
      where: { companyId, employeeId },
      orderBy: { advanceDate: 'asc' },
      select: { advanceDate: true },
    }),
    prisma.employeeWarning.findFirst({
      where: { companyId, employeeId },
      orderBy: { warningDate: 'asc' },
      select: { warningDate: true },
    }),
    prisma.employeeFine.findFirst({
      where: { companyId, employeeId, status: 'APPROVED' },
      orderBy: { fineDate: 'asc' },
      select: { fineDate: true },
    }),
    prisma.employeeCompensation.findFirst({
      where: { companyId, employeeId },
      orderBy: { effectiveFrom: 'asc' },
      select: { effectiveFrom: true },
    }),
    prisma.payRunLine.findFirst({
      where: { companyId, employeeId, skipped: false },
      orderBy: { payRun: { month: 'asc' } },
      select: { payRun: { select: { month: true } } },
    }),
  ]);
  const dates = [
    ymdFromDb(attendance?.workDate),
    ymdFromDb(leave?.startDate),
    ymdFromDb(advance?.advanceDate),
    ymdFromDb(warning?.warningDate),
    ymdFromDb(fine?.fineDate),
    ymdFromDb(compensation?.effectiveFrom),
    pay?.payRun.month ? `${pay.payRun.month}-01` : null,
  ].filter((value): value is string => Boolean(value));
  dates.sort();
  return dates[0] ?? null;
}

export async function loadEmployeeHistory(input: {
  companyId: string;
  employeeId: string;
  from: string | null;
  to: string | null;
  access: {
    attendanceAndLeave: boolean;
    payroll: boolean;
    compensation: boolean;
    visa: boolean;
    documents: boolean;
  };
  includeAttendanceDays: boolean;
}): Promise<EmployeeHistoryReport | { error: string; status: number }> {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, companyId: input.companyId },
    select: {
      id: true,
      fullName: true,
      preferredName: true,
      employeeCode: true,
      status: true,
      designation: true,
      department: true,
      employmentType: true,
      hireDate: true,
      terminationDate: true,
      adminNotes: true,
      email: true,
      phone: true,
      nationality: true,
      dateOfBirth: true,
      gender: true,
      bloodGroup: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      company: { select: { name: true } },
    },
  });
  if (!employee) return { error: 'Employee not found', status: 404 };

  const today = dubaiTodayYmd();
  const hireDate = ymdFromDb(employee.hireDate);
  const terminationDate = ymdFromDb(employee.terminationDate);
  const serviceLabel = tenureLabel(employee.hireDate, {
    terminationDate: employee.terminationDate,
    status: employee.status,
    referenceDate: dubaiReferenceDate(),
  });
  const identity = {
    id: employee.id,
    fullName: employee.fullName,
    preferredName: employee.preferredName,
    employeeCode: employee.employeeCode,
    status: employee.status,
    designation: employee.designation,
    department: employee.department,
    employmentType: employee.employmentType,
    hireDate,
    terminationDate,
    serviceLabel,
    adminNotes: employee.adminNotes,
    companyName: employee.company.name,
    email: employee.email,
    phone: employee.phone,
    nationality: displayNationalityCountryName(employee.nationality).trim() || null,
    dateOfBirth: ymdFromDb(employee.dateOfBirth),
    gender: employee.gender,
    bloodGroup: employee.bloodGroup,
    emergencyContactName: employee.emergencyContactName,
    emergencyContactPhone: employee.emergencyContactPhone,
  };

  const defaultEnd = terminationDate && terminationDate <= today ? terminationDate : today;
  const hasCustomRange = Boolean(input.from && input.to);
  if (hasCustomRange && input.from! > input.to!) {
    return { error: 'From date must be on or before the to date.', status: 400 };
  }
  const from = hasCustomRange
    ? input.from!
    : hireDate ?? (await earliestRecordDate(input.companyId, employee.id)) ?? defaultEnd;
  const to = hasCustomRange ? input.to! : defaultEnd;
  if (from > to) {
    const empty = buildEmployeeHistory({ from: '2026-01-02', to: '2026-01-01', attendance: [], leaves: [] });
    return assembleEmployeeHistoryReport({
      employee: identity,
      range: null,
      rangeNote: hireDate && hireDate > today ? 'Joining date is in the future.' : 'No records fall in this period.',
      counts: empty,
      payWholeMonths: true,
      payLines: [],
      packages: [],
      advances: [],
      fines: [],
      warnings: [],
      visaPeriods: [],
      documents: { records: [], extraFiles: [] },
      access: input.access,
      includeAttendanceDays: input.includeAttendanceDays,
    });
  }

  const fromDate = dateFromYmd(from);
  const toDate = dateFromYmd(to);

  const [attendance, leaves, packages, payLines, advances, fines, warnings, visaPeriods, documents, extraFiles] = await Promise.all([
    prisma.attendanceEntry.findMany({
      // Days before the selected start stay in this query so a return that already happened is not read as later overstay.
      where: { companyId: input.companyId, employeeId: employee.id, workDate: { lte: toDate } },
      select: { workDate: true, status: true, lateMinutes: true, earlyLeaveMinutes: true, overtimeMinutes: true, remarks: true },
    }),
    prisma.leaveRequest.findMany({
      where: { companyId: input.companyId, employeeId: employee.id, status: 'APPROVED', startDate: { lte: toDate } },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        leaveType: true,
        leaveTypeRef: { select: { code: true, name: true } },
      },
    }),
    prisma.employeeCompensation.findMany({
      where: { companyId: input.companyId, employeeId: employee.id },
      select: {
        id: true,
        effectiveFrom: true,
        effectiveTo: true,
        createdAt: true,
        monthlyBasic: true,
        dailyRate: true,
        payType: { select: { name: true, config: true } },
        allowances: {
          select: {
            amount: true,
            allowanceType: { select: { name: true, componentKind: true, applicationMode: true } },
          },
        },
      },
    }),
    prisma.payRunLine.findMany({
      where: { companyId: input.companyId, employeeId: employee.id, skipped: false },
      select: {
        gross: true,
        breakdown: true,
        dayDetails: true,
        payRun: { select: { month: true } },
      },
    }),
    prisma.employeeAdvance.findMany({
      where: { companyId: input.companyId, employeeId: employee.id, advanceDate: { gte: fromDate, lte: toDate } },
      orderBy: [{ advanceDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.employeeFine.findMany({
      where: {
        companyId: input.companyId,
        employeeId: employee.id,
        status: 'APPROVED',
        fineDate: { gte: fromDate, lte: toDate },
      },
      orderBy: [{ fineDate: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, fineDate: true, amount: true, description: true },
    }),
    prisma.employeeWarning.findMany({
      where: { companyId: input.companyId, employeeId: employee.id, warningDate: { gte: fromDate, lte: toDate } },
      orderBy: [{ warningDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.visaPeriod.findMany({
      where: {
        companyId: input.companyId,
        employeeId: employee.id,
        startDate: { lte: toDate },
        endDate: { gte: fromDate },
      },
      orderBy: { startDate: 'asc' },
      select: { id: true, label: true, startDate: true, endDate: true, status: true },
    }),
    input.access.documents
      ? prisma.employeeDocument.findMany({
          where: { companyId: input.companyId, employeeId: employee.id },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            documentNumber: true,
            issueDate: true,
            expiryDate: true,
            issuingAuthority: true,
            documentType: { select: { name: true } },
            visaPeriod: { select: { label: true } },
          },
        })
      : Promise.resolve([]),
    input.access.documents
      ? prisma.employeeExtraFile.findMany({
          where: { companyId: input.companyId, employeeId: employee.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true, fileName: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const weekdayCache = new Map<string, number[]>();
  const excludedWeekdaysForDate = (workDate: string) => {
    const cached = weekdayCache.get(workDate);
    if (cached) return cached;
    const active = resolveCompensationPackageForDate(packages, workDate);
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
  };

  const counts = buildEmployeeHistory({
    from,
    to,
    attendance: attendance.map((row) => ({
      workDate: ymdFromDb(row.workDate) ?? '',
      status: row.status,
      lateMinutes: row.lateMinutes,
      earlyLeaveMinutes: row.earlyLeaveMinutes,
      overtimeMinutes: row.overtimeMinutes,
      remarks: row.remarks,
    })),
    leaves: leaves.map((row) => ({
      id: row.id,
      status: row.status,
      startDate: ymdFromDb(row.startDate) ?? '',
      endDate: ymdFromDb(row.endDate) ?? '',
      leaveTypeCode: row.leaveTypeRef?.code ?? null,
      leaveTypeName: row.leaveTypeRef?.name ?? null,
      legacyLeaveType: row.leaveType,
    })),
    excludedWeekdaysForDate,
  });

  const visiblePay = payLines
    .filter((line) => monthOverlapsRange(line.payRun.month, from, to))
    .sort((a, b) => b.payRun.month.localeCompare(a.payRun.month))
    .map((line) => {
      const breakdown = line.breakdown && typeof line.breakdown === 'object' ? (line.breakdown as Record<string, unknown>) : {};
      const unpaid = Number(breakdown.unpaidAbsentDays);
      const componentDeduction = sumDayField(line.dayDetails, 'componentDeduction');
      return {
        month: line.payRun.month,
        gross: Number(line.gross),
        unpaidAbsentDays: Number.isFinite(unpaid) ? unpaid : null,
        componentDeduction,
        otPay: sumDayField(line.dayDetails, 'otHourSalary'),
        deductionDetailStored: componentDeduction != null,
      };
    });

  const visiblePackages = packages
    .filter((pkg) => {
      const start = ymdFromDb(pkg.effectiveFrom);
      const end = ymdFromDb(pkg.effectiveTo);
      if (!start || start > to) return false;
      if (end && end < from) return false;
      return true;
    })
    .sort((a, b) => ymdFromDb(b.effectiveFrom)!.localeCompare(ymdFromDb(a.effectiveFrom)!))
    .map((pkg) => ({
      id: pkg.id,
      payTypeName: pkg.payType.name,
      effectiveFrom: ymdFromDb(pkg.effectiveFrom) ?? '',
      effectiveTo: ymdFromDb(pkg.effectiveTo),
      monthlyBasic: money(pkg.monthlyBasic),
      dailyRate: money(pkg.dailyRate),
      deductions: pkg.allowances
        .filter((row) => row.allowanceType.componentKind === 'DEDUCTION')
        .map((row) => ({
          name: row.allowanceType.name,
          amount: Number(row.amount),
          applicationMode: row.allowanceType.applicationMode,
        })),
    }));

  return assembleEmployeeHistoryReport({
    employee: identity,
    range: { from, to },
    rangeNote: null,
    counts,
    payWholeMonths: payRangeIsWholeMonths(from, to),
    payLines: visiblePay,
    packages: visiblePackages,
    advances: advances.map((row) => ({
      id: row.id,
      date: ymdFromDb(row.advanceDate) ?? '',
      amount: Number(row.amount),
      note: row.note,
    })),
    fines: fines.map((row) => ({
      id: row.id,
      date: ymdFromDb(row.fineDate) ?? '',
      amount: Number(row.amount),
      description: row.description,
    })),
    warnings: warnings.map((row) => ({
      id: row.id,
      date: ymdFromDb(row.warningDate) ?? '',
      note: row.note,
    })),
    visaPeriods: visaPeriods.map((row) => ({
      id: row.id,
      label: row.label,
      startDate: ymdFromDb(row.startDate) ?? '',
      endDate: ymdFromDb(row.endDate) ?? '',
      status: row.status,
    })),
    documents: {
      records: documents
        .filter((row) =>
          documentOverlapsHistoryRange({
            issueDate: ymdFromDb(row.issueDate),
            expiryDate: ymdFromDb(row.expiryDate),
            from,
            to,
            fullHistory: !hasCustomRange,
          })
        )
        .map((row) => ({
          id: row.id,
          typeName: row.documentType.name,
          number: row.documentNumber,
          issueDate: ymdFromDb(row.issueDate),
          expiryDate: ymdFromDb(row.expiryDate),
          authority: row.issuingAuthority,
          visaLabel: input.access.visa ? row.visaPeriod?.label ?? null : null,
        }))
        .sort(
          (a, b) =>
            (a.issueDate ?? a.expiryDate ?? '9999-99-99').localeCompare(b.issueDate ?? b.expiryDate ?? '9999-99-99') ||
            a.typeName.localeCompare(b.typeName) ||
            a.id.localeCompare(b.id)
        ),
      extraFiles: extraFiles
        .map((row) => ({ id: row.id, fileName: row.fileName, uploadedOn: dubaiCalendarYmd(row.createdAt) }))
        .filter((row) => row.uploadedOn >= from && row.uploadedOn <= to),
    },
    access: input.access,
    includeAttendanceDays: input.includeAttendanceDays,
  });
}
