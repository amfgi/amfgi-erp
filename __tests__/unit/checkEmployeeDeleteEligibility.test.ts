import { checkEmployeeDeleteEligibility } from '@/lib/hr/checkEmployeeDeleteEligibility';

function createMockPrisma(counts: Partial<Record<string, number>> = {}) {
  const employee = {
    id: 'emp-1',
    employeeCode: 'E-001',
    fullName: 'Test Employee',
  };

  const count = (key: string) => jest.fn(async () => counts[key] ?? 0);

  return {
    employee: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'emp-1' ? employee : null,
      ),
    },
    user: { count: count('portalLogin') },
    visaPeriod: { count: count('visa') },
    employeeDocument: { count: count('documents') },
    workAssignmentMember: { count: count('scheduleAssignments') },
    workAssignment: {
      count: jest.fn(
        async ({
          where,
        }: {
          where: {
            teamLeaderEmployeeId?: string;
            driver1EmployeeId?: string;
            driver2EmployeeId?: string;
          };
        }) => {
          if (where.teamLeaderEmployeeId) return counts.teamLead ?? 0;
          if (where.driver1EmployeeId) return counts.driver1 ?? 0;
          if (where.driver2EmployeeId) return counts.driver2 ?? 0;
          return 0;
        },
      ),
    },
    scheduleAbsence: { count: count('scheduleAbsences') },
    attendanceEntry: { count: count('attendance') },
    driverRunLog: { count: count('driverRuns') },
    jobItemAssignment: { count: count('jobItemAssignments') },
    leaveRequest: { count: count('leaveRequests') },
    leaveBalance: { count: count('leaveBalances') },
    employeeCompensation: { count: count('compensation') },
    employeeAllowance: { count: count('allowances') },
    payRunLine: { count: count('payRunLines') },
    employeeMobileAccessToken: { count: count('mobileTokens') },
  };
}

describe('checkEmployeeDeleteEligibility', () => {
  it('allows delete when no linked records exist', async () => {
    const prisma = createMockPrisma();
    const result = await checkEmployeeDeleteEligibility(prisma as never, 'co-1', 'emp-1');
    expect(result.canDelete).toBe(true);
    expect(result.links).toHaveLength(0);
    expect(result.employeeCode).toBe('E-001');
  });

  it('blocks delete when schedule or attendance is linked', async () => {
    const prisma = createMockPrisma({ scheduleAssignments: 1, attendance: 3 });
    const result = await checkEmployeeDeleteEligibility(prisma as never, 'co-1', 'emp-1');
    expect(result.canDelete).toBe(false);
    expect(result.deleteBlockedReason).toBe('linked_data');
    expect(result.links.map((link) => link.category)).toEqual(
      expect.arrayContaining(['scheduleAssignments', 'attendance']),
    );
  });

  it('blocks delete when portal login or payroll lines exist', async () => {
    const prisma = createMockPrisma({ portalLogin: 1, payRunLines: 2 });
    const result = await checkEmployeeDeleteEligibility(prisma as never, 'co-1', 'emp-1');
    expect(result.canDelete).toBe(false);
    expect(result.totalLinkedCount).toBe(3);
    expect(result.links.map((link) => link.category)).toEqual(
      expect.arrayContaining(['portalLogin', 'payRunLines']),
    );
  });

  it('throws when employee is missing', async () => {
    const prisma = createMockPrisma();
    await expect(checkEmployeeDeleteEligibility(prisma as never, 'co-1', 'missing')).rejects.toThrow(
      'Employee not found',
    );
  });
});
