import { auth } from '@/auth';
import { employeeDocumentDisplayName } from '@/lib/hr/employeeDocumentDisplay';
import { readOnLeaveFrom } from '@/lib/hr/employeeLeavePeriod';
import { getPortalEmployeeForSession } from '@/lib/hr/linkedEmployee';
import { getEmployeePortalLeaveBalance } from '@/lib/hr/leaveBalance';
import { countLeaveDaysInclusive } from '@/lib/hr/leaveTypes';
import { dateFromYmd } from '@/lib/hr/workDate';
import { prisma } from '@/lib/db/prisma';
import { workedMinutesFromPunches } from '@/lib/hr/attendanceDuration';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

function monthBoundsUtc(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0));
  return { from, to };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const emp = await getPortalEmployeeForSession(session.user);
  if (!emp) return errorResponse('No linked employee', 403);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const { from: monthStart, to: monthEnd } = monthBoundsUtc(year, month);
  const today = dateFromYmd(
    `${year}-${String(month).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
  );

  const [employee, balance, requests, monthAttendance] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: emp.id, companyId: emp.companyId },
      select: {
        fullName: true,
        preferredName: true,
        employeeCode: true,
        designation: true,
        department: true,
        status: true,
        profileExtension: true,
      },
    }),
    getEmployeePortalLeaveBalance(prisma, emp.companyId, emp.id),
    prisma.leaveRequest.findMany({
      where: { companyId: emp.companyId, employeeId: emp.id },
      include: {
        leaveTypeRef: { select: { id: true, name: true, code: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 20,
    }),
    prisma.attendanceEntry.findMany({
      where: {
        companyId: emp.companyId,
        employeeId: emp.id,
        workDate: { gte: monthStart, lte: monthEnd },
      },
      select: {
        status: true,
        checkInAt: true,
        checkOutAt: true,
        breakStartAt: true,
        breakEndAt: true,
        overtimeMinutes: true,
      },
    }),
  ]);

  if (!employee || !balance) return errorResponse('Employee not found', 404);

  const attendanceSummary = monthAttendance.reduce(
    (acc, row) => {
      acc.days += 1;
      if (row.status === 'PRESENT') acc.present += 1;
      if (row.status === 'ABSENT') acc.absent += 1;
      if (row.status === 'LEAVE') acc.leave += 1;
      const workedMinutes = workedMinutesFromPunches({
        checkInAt: row.checkInAt,
        checkOutAt: row.checkOutAt,
        breakStartAt: row.breakStartAt,
        breakEndAt: row.breakEndAt,
      });
      acc.workedMinutes += workedMinutes;
      acc.overtimeMinutes += row.overtimeMinutes ?? 0;
      return acc;
    },
    { days: 0, present: 0, absent: 0, leave: 0, workedMinutes: 0, overtimeMinutes: 0 }
  );

  const pendingRequests = requests.filter((row) => row.status === 'PENDING');
  const approvedRequests = requests.filter((row) => row.status === 'APPROVED');
  const approvedLeaveDaysYtd = approvedRequests.reduce(
    (sum, row) => sum + countLeaveDaysInclusive(row.startDate, row.endDate),
    0
  );

  const activeApprovedLeave = approvedRequests.find(
    (row) => row.startDate <= today && row.endDate >= today
  );

  const upcomingDocument = await prisma.employeeDocument.findFirst({
    where: {
      employeeId: emp.id,
      companyId: emp.companyId,
      portalViewEnabled: true,
      expiryDate: { gte: today },
    },
    orderBy: { expiryDate: 'asc' },
    select: {
      expiryDate: true,
      customFields: true,
      portalViewEnabled: true,
      documentType: { select: { name: true, slug: true } },
    },
  });

  return successResponse({
    employee: {
      fullName: employee.fullName,
      preferredName: employee.preferredName,
      employeeCode: employee.employeeCode,
      designation: employee.designation,
      department: employee.department,
      status: employee.status,
      onLeaveFrom: readOnLeaveFrom(employee.profileExtension),
    },
    leaveBalance: {
      entitlementDays: balance.entitlementDays,
      usedDays: balance.usedDays,
      adjustedDays: balance.adjustedDays,
      remainingDays: balance.remainingDays,
      rolloverEnabled: balance.rolloverEnabled,
    },
    leaveSummary: {
      pendingCount: pendingRequests.length,
      approvedLeaveDaysYtd,
      activeApprovedLeave: activeApprovedLeave
        ? {
            id: activeApprovedLeave.id,
            leaveType: activeApprovedLeave.leaveTypeRef?.name ?? activeApprovedLeave.leaveType,
            startDate: activeApprovedLeave.startDate,
            endDate: activeApprovedLeave.endDate,
          }
        : null,
    },
    attendanceSummary: {
      month: `${year}-${String(month).padStart(2, '0')}`,
      ...attendanceSummary,
    },
    upcomingDocument: upcomingDocument
      ? {
          name: employeeDocumentDisplayName(upcomingDocument),
          expiryDate: upcomingDocument.expiryDate,
        }
      : null,
    recentLeaveRequests: requests.slice(0, 8).map((row) => ({
      id: row.id,
      leaveType: row.leaveTypeRef?.name ?? row.leaveType,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
      reason: row.reason,
      reviewNote: row.reviewNote,
      reviewedBy: row.reviewedBy?.name ?? null,
      reviewedAt: row.reviewedAt,
      submittedAt: row.submittedAt,
    })),
  });
}
