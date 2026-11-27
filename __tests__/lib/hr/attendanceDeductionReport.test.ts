import { attendanceSummaryRows, buildAttendanceReportDraft, attendanceReportFileName, historyAppendix } from '@/lib/hr/attendanceDeductionReport';
import { buildLeaveTypeCounts, type EmployeeHistoryReport } from '@/lib/hr/employeeHistoryReport';

const today = '2026-11-21';

function report(): EmployeeHistoryReport {
  return {
    employee: {
      id: 'emp-1',
      fullName: 'Laxman Ram',
      preferredName: null,
      employeeCode: 'AMF-12',
      status: 'ACTIVE',
      designation: 'Helper',
      department: null,
      employmentType: null,
      hireDate: '2026-07-18',
      terminationDate: null,
      serviceLabel: '4 mos. 3 days with company',
      adminNotes: null,
      companyName: 'Al Muraqib Fiber Glass Industry LLC',
      email: null,
      phone: null,
      nationality: null,
      dateOfBirth: null,
      gender: null,
      bloodGroup: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
    },
    documents: {
      records: [
        {
          id: 'eid',
          typeName: 'Emirates ID',
          number: '784',
          issueDate: '2026-07-30',
          expiryDate: '2028-07-29',
          authority: null,
          visaLabel: null,
        },
      ],
      extraFiles: [],
    },
    range: null,
    rangeNote: null,
    attendanceAndLeaveMessage: null,
    attendanceAndLeave: {
      workedDays: 1,
      halfDays: 0,
      absentDays: 1,
      unauthorisedDays: 1,
      overstayDays: 0,
      missingPunchDays: 0,
      sickDays: 2,
      paidDays: 0,
      unpaidDays: 0,
      annualDays: 0,
      leaveTypeCounts: [
        { label: 'Sick leave', usedDays: 2, allowance: 90 },
        { label: 'Paid leave', usedDays: 0, allowance: null },
        { label: 'Unpaid leave', usedDays: 0, allowance: null },
        { label: 'Annual leave', usedDays: 0, allowance: 30 },
      ],
      otherLeave: [],
      returnNotMarked: 0,
      lateDays: 1,
      lateMinutes: 129,
      earlyDays: 0,
      earlyMinutes: 0,
      overtimeMinutes: 0,
      leaves: [],
      absentNotes: [],
      exceptions: {
        late: [
          {
            date: '2026-08-11',
            status: 'PRESENT',
            lateMinutes: 15,
            earlyLeaveMinutes: 0,
            overtimeMinutes: 0,
            countedAs: 'worked',
            remark: null,
          },
        ],
        early: [],
        unauthorised: [
          {
            date: '2026-08-18',
            status: 'ABSENT',
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
            overtimeMinutes: 0,
            countedAs: 'absent',
            remark: 'Absent without inform',
          },
        ],
        missingPunch: [],
        overstay: [],
      },
    },
    pay: null,
    salaryStructure: {
      packages: [
        {
          id: 'pay',
          payTypeName: 'Monthly',
          effectiveFrom: '2026-07-18',
          effectiveTo: null,
          monthlyBasic: 1600,
          dailyRate: null,
          deductions: [],
        },
      ],
    },
    advances: null,
    fines: { total: 1315, rows: [] },
    warnings: [],
    visaPeriods: [{ id: 'visa', label: 'Current', startDate: '2026-07-30', endDate: '2028-07-29', status: 'ACTIVE' }],
  };
}

describe('attendance deduction report', () => {
  it('fills matched reference fields and leaves the unmatched ones blank', () => {
    const draft = buildAttendanceReportDraft({
      report: report(),
      sections: ['absent', 'salary', 'fines', 'visa', 'documents'],
      today,
    });
    expect(draft.company).toBe('Al Muraqib Fiber Glass Industry LLC');
    expect(draft.employee).toBe('Laxman Ram');
    expect(draft.period).toBe('All Time');
    expect(draft.generated).toBe('21/11/2026');
    expect(draft.joinDate).toBe('18/07/2026');
    expect(draft.service).toBe('4 Months, 3 Days.');
    expect(draft.currentSalary).toBe('1600 AED.');
    expect(draft.unauthorizedLeave).toBe('1 Day.');
    expect(draft.totalLeave).toBe('');
    expect(draft.personal).toEqual([]);
    expect(draft.absentDays).toBe('1');
    expect(draft.lateDays).toBe('1');
    expect(draft.timeLate).toBe('2h 9m');
    expect(draft.eidIssue).toBe('30/07/2026');
    expect(draft.eidExpiry).toBe('29/07/2028');
    expect(draft.visaExpiresWithin).toBe('20 Mo, 8 Days.');
    expect(draft.visaAbsentDays).toBe('1 Day');
    expect(draft.fineTotal).toBe('1,315 AED');
    expect(draft.incidents.map((row) => row.fine)).toEqual(['', '']);
    expect(draft.incidents.map((row) => row.reason)).toEqual([
      '15 min Late – Arrived on duty.',
      'Absent without inform',
    ]);
  });

  it('blanks a reference value when its section is not checked', () => {
    const draft = buildAttendanceReportDraft({
      report: report(),
      sections: ['leave'],
      today,
    });
    expect(draft.currentSalary).toBe('');
    expect(draft.unauthorizedLeave).toBe('');
    expect(draft.totalLeave).toBe('2 Days.');
    expect(draft.personal).toEqual([]);
    expect(draft.absentDays).toBe('');
    expect(draft.visaAbsentDays).toBe('');
    expect(draft.fineTotal).toBe('');
    expect(draft.eidIssue).toBe('');
    expect(draft.visaExpiresWithin).toBe('');
    expect(draft.incidents).toEqual([]);
    expect(historyAppendix(report(), [])).toEqual([]);
    const leave = historyAppendix(report(), ['leave']).find((block) => block.title === 'Leave');
    expect(leave?.notes[0]).toBe('Sick leave 2/90. Paid leave 0. Unpaid leave 0. Annual leave 0/30.');
    expect(buildLeaveTypeCounts(
      [
        { name: 'Sick leave', code: 'SICK', entitlementDays: 90 },
        { name: 'Annual leave', code: 'ANNUAL', entitlementDays: 30 },
        { name: 'Paid leave', code: 'PAID', entitlementDays: null },
      ],
      [
        { typeName: 'Sick leave', days: 1 },
        { typeName: 'Medical', typeCode: 'SICK', days: 1 },
        { typeName: 'Hajj leave', days: 1 },
      ],
    )).toEqual([
      { label: 'Sick leave', usedDays: 2, allowance: 90 },
      { label: 'Annual leave', usedDays: 0, allowance: 30 },
      { label: 'Paid leave', usedDays: 0, allowance: null },
      { label: 'Hajj leave', usedDays: 1, allowance: null },
    ]);
    const absent = historyAppendix(report(), ['absent']);
    const absentBlock = absent.find((block) => block.title === 'Absent date');
    expect(absentBlock?.headers).toEqual(['Absent date', 'Note']);
    expect(absentBlock?.rows).toEqual([['2026-08-18', 'Absent without inform']]);
    expect(absent.some((block) => block.headers.includes('Kind'))).toBe(false);
  });

  it('names the file with the employee name, code, and date', () => {
    const draft = buildAttendanceReportDraft({
      report: report(),
      sections: ['absent', 'leave', 'fines', 'advances', 'warnings'],
      today,
    });
    expect(attendanceSummaryRows(report(), draft, ['absent', 'leave', 'fines', 'advances', 'warnings']).map((row) => row.label)).toEqual([
      'Absent',
      'Leave',
      'Advances',
      'Fines',
      'Warnings',
    ]);
    expect(attendanceReportFileName(report(), 'pdf', today)).toBe('Laxman Ram AMF-12 2026-11-21.pdf');
    const unnamed = report();
    unnamed.employee.employeeCode = '';
    expect(attendanceReportFileName(unnamed, 'docx', today)).toBe('Laxman Ram emp-1 2026-11-21.docx');
  });
});
