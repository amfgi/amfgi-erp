import type { PrismaClient } from '@prisma/client';

export type EmployeeDeleteLinkCategory =
  | 'portalLogin'
  | 'visa'
  | 'documents'
  | 'scheduleAssignments'
  | 'teamLeadOrDriver'
  | 'scheduleAbsences'
  | 'attendance'
  | 'driverRuns'
  | 'jobItemAssignments'
  | 'leaveRequests'
  | 'leaveBalances'
  | 'compensation'
  | 'allowances'
  | 'payRunLines'
  | 'mobileTokens';

export interface EmployeeDeleteLinkSummary {
  category: EmployeeDeleteLinkCategory;
  label: string;
  count: number;
}

export interface EmployeeDeleteCheckResult {
  canDelete: boolean;
  employeeCode: string;
  fullName: string;
  deleteBlockedReason?: 'linked_data';
  links: EmployeeDeleteLinkSummary[];
  totalLinkedCount: number;
}

type PrismaLike = Pick<
  PrismaClient,
  | 'employee'
  | 'user'
  | 'visaPeriod'
  | 'employeeDocument'
  | 'workAssignmentMember'
  | 'workAssignment'
  | 'scheduleAbsence'
  | 'attendanceEntry'
  | 'driverRunLog'
  | 'jobItemAssignment'
  | 'leaveRequest'
  | 'leaveBalance'
  | 'employeeCompensation'
  | 'employeeAllowance'
  | 'payRunLine'
  | 'employeeMobileAccessToken'
>;

function pushLink(
  links: EmployeeDeleteLinkSummary[],
  category: EmployeeDeleteLinkCategory,
  label: string,
  count: number,
) {
  if (count > 0) links.push({ category, label, count });
}

export function formatEmployeeDeleteBlockMessage(eligibility: EmployeeDeleteCheckResult): string {
  if (eligibility.canDelete || eligibility.links.length === 0) {
    return 'This employee cannot be deleted because it has linked data.';
  }
  const parts = eligibility.links.map((link) => {
    const noun = link.count === 1 ? link.label.toLowerCase() : `${link.label.toLowerCase()}s`;
    return `${link.count} ${noun}`;
  });
  return `Cannot delete employee: linked data exists (${parts.join(', ')}).`;
}

export async function checkEmployeeDeleteEligibility(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
): Promise<EmployeeDeleteCheckResult> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: { id: true, employeeCode: true, fullName: true },
  });

  if (!employee) {
    throw new Error('Employee not found');
  }

  const [
    portalLoginCount,
    visaCount,
    documentCount,
    assignmentMemberCount,
    teamLeadCount,
    driver1Count,
    driver2Count,
    absenceCount,
    attendanceCount,
    driverRunCount,
    jobItemAssignmentCount,
    leaveRequestCount,
    leaveBalanceCount,
    compensationCount,
    allowanceCount,
    payRunLineCount,
    mobileTokenCount,
  ] = await Promise.all([
    prisma.user.count({ where: { linkedEmployeeId: employeeId } }),
    prisma.visaPeriod.count({ where: { companyId, employeeId } }),
    prisma.employeeDocument.count({ where: { companyId, employeeId } }),
    prisma.workAssignmentMember.count({ where: { companyId, employeeId } }),
    prisma.workAssignment.count({ where: { companyId, teamLeaderEmployeeId: employeeId } }),
    prisma.workAssignment.count({ where: { companyId, driver1EmployeeId: employeeId } }),
    prisma.workAssignment.count({ where: { companyId, driver2EmployeeId: employeeId } }),
    prisma.scheduleAbsence.count({ where: { companyId, employeeId } }),
    prisma.attendanceEntry.count({ where: { companyId, employeeId } }),
    prisma.driverRunLog.count({ where: { companyId, driverEmployeeId: employeeId } }),
    prisma.jobItemAssignment.count({ where: { companyId, employeeId } }),
    prisma.leaveRequest.count({ where: { companyId, employeeId } }),
    prisma.leaveBalance.count({ where: { companyId, employeeId } }),
    prisma.employeeCompensation.count({ where: { companyId, employeeId } }),
    prisma.employeeAllowance.count({ where: { companyId, employeeId } }),
    prisma.payRunLine.count({ where: { companyId, employeeId } }),
    prisma.employeeMobileAccessToken.count({ where: { companyId, employeeId } }),
  ]);

  const teamLeadOrDriverCount = teamLeadCount + driver1Count + driver2Count;

  const links: EmployeeDeleteLinkSummary[] = [];
  pushLink(links, 'portalLogin', 'Portal login', portalLoginCount);
  pushLink(links, 'visa', 'Visa period', visaCount);
  pushLink(links, 'documents', 'Document', documentCount);
  pushLink(links, 'scheduleAssignments', 'Schedule assignment', assignmentMemberCount);
  pushLink(links, 'teamLeadOrDriver', 'Team lead / driver role', teamLeadOrDriverCount);
  pushLink(links, 'scheduleAbsences', 'Schedule absence', absenceCount);
  pushLink(links, 'attendance', 'Attendance entry', attendanceCount);
  pushLink(links, 'driverRuns', 'Driver run log', driverRunCount);
  pushLink(links, 'jobItemAssignments', 'Job item assignment', jobItemAssignmentCount);
  pushLink(links, 'leaveRequests', 'Leave request', leaveRequestCount);
  pushLink(links, 'leaveBalances', 'Leave balance', leaveBalanceCount);
  pushLink(links, 'compensation', 'Compensation record', compensationCount);
  pushLink(links, 'allowances', 'Allowance', allowanceCount);
  pushLink(links, 'payRunLines', 'Payroll run line', payRunLineCount);
  pushLink(links, 'mobileTokens', 'Mobile access token', mobileTokenCount);

  const totalLinkedCount = links.reduce((sum, link) => sum + link.count, 0);

  return {
    canDelete: totalLinkedCount === 0,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    deleteBlockedReason: totalLinkedCount > 0 ? 'linked_data' : undefined,
    links,
    totalLinkedCount,
  };
}
