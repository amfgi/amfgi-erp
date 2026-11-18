import type { CountedDay, EmployeeHistoryCounts, HistoryLeaveTotal } from '@/lib/hr/employeeHistory';

export type HistoryPayLine = {
  month: string;
  gross: number;
  unpaidAbsentDays: number | null;
  componentDeduction: number | null;
  otPay: number | null;
  deductionDetailStored: boolean;
};

export type HistorySalaryPackage = {
  id: string;
  payTypeName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  monthlyBasic: number | null;
  dailyRate: number | null;
  deductions: Array<{ name: string; amount: number; applicationMode: string }>;
};

export type EmployeeHistoryReport = {
  employee: {
    id: string;
    fullName: string;
    preferredName: string | null;
    employeeCode: string;
    status: string;
    designation: string | null;
    department: string | null;
    employmentType: string | null;
    hireDate: string | null;
    terminationDate: string | null;
    serviceLabel: string | null;
    adminNotes: string | null;
    companyName: string;
    email: string | null;
    phone: string | null;
    nationality: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    bloodGroup: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  };
  documents: null | {
    records: Array<{
      id: string;
      typeName: string;
      number: string | null;
      issueDate: string | null;
      expiryDate: string | null;
      authority: string | null;
      visaLabel: string | null;
    }>;
    extraFiles: Array<{ id: string; fileName: string; uploadedOn: string }>;
  };
  range: { from: string; to: string } | null;
  rangeNote: string | null;
  attendanceAndLeaveMessage: string | null;
  attendanceAndLeave: null | {
    workedDays: number;
    halfDays: number;
    absentDays: number;
    unauthorisedDays: number;
    overstayDays: number;
    missingPunchDays: number;
    sickDays: number;
    paidDays: number;
    unpaidDays: number;
    annualDays: number;
    otherLeave: Array<{ name: string; days: number }>;
    returnNotMarked: number;
    lateDays: number;
    lateMinutes: number;
    earlyDays: number;
    earlyMinutes: number;
    overtimeMinutes: number;
    leaves: HistoryLeaveTotal[];
    absentNotes: EmployeeHistoryCounts['absentNotes'];
    exceptions: EmployeeHistoryCounts['exceptions'];
    attendanceDays?: CountedDay[];
  };
  pay: null | { wholeMonths: boolean; lines: HistoryPayLine[] };
  salaryStructure: null | { packages: HistorySalaryPackage[] };
  advances: null | { total: number; rows: Array<{ id: string; date: string; amount: number; note: string | null }> };
  fines: null | { total: number; rows: Array<{ id: string; date: string; amount: number; description: string }> };
  warnings: Array<{ id: string; date: string; note: string }>;
  visaPeriods: null | Array<{ id: string; label: string; startDate: string; endDate: string; status: string }>;
};

export function assembleEmployeeHistoryReport(input: {
  employee: EmployeeHistoryReport['employee'];
  range: { from: string; to: string } | null;
  rangeNote: string | null;
  counts: EmployeeHistoryCounts;
  payWholeMonths: boolean;
  payLines: HistoryPayLine[];
  packages: HistorySalaryPackage[];
  advances: Array<{ id: string; date: string; amount: number; note: string | null }>;
  fines: Array<{ id: string; date: string; amount: number; description: string }>;
  warnings: Array<{ id: string; date: string; note: string }>;
  visaPeriods: Array<{ id: string; label: string; startDate: string; endDate: string; status: string }>;
  documents: EmployeeHistoryReport['documents'];
  access: {
    attendanceAndLeave: boolean;
    payroll: boolean;
    compensation: boolean;
    visa: boolean;
    documents: boolean;
  };
  includeAttendanceDays: boolean;
}): EmployeeHistoryReport {
  const { counts, access } = input;
  return {
    employee: input.employee,
    range: input.range,
    rangeNote: input.rangeNote,
    attendanceAndLeaveMessage: access.attendanceAndLeave
      ? null
      : 'Attendance and leave access are both required for these totals.',
    attendanceAndLeave: access.attendanceAndLeave
      ? {
          workedDays: counts.workedDays,
          halfDays: counts.halfDays,
          absentDays: counts.absentDays,
          unauthorisedDays: counts.unauthorisedDays,
          overstayDays: counts.overstayDays,
          missingPunchDays: counts.missingPunchDays,
          sickDays: counts.sickDays,
          paidDays: counts.paidDays,
          unpaidDays: counts.unpaidDays,
          annualDays: counts.annualDays,
          otherLeave: counts.otherLeave,
          returnNotMarked: counts.returnNotMarked,
          lateDays: counts.lateDays,
          lateMinutes: counts.lateMinutes,
          earlyDays: counts.earlyDays,
          earlyMinutes: counts.earlyMinutes,
          overtimeMinutes: counts.overtimeMinutes,
          leaves: counts.leaves,
          absentNotes: counts.absentNotes,
          exceptions: counts.exceptions,
          ...(input.includeAttendanceDays ? { attendanceDays: counts.attendanceDays } : {}),
        }
      : null,
    pay: access.payroll ? { wholeMonths: input.payWholeMonths, lines: input.payLines } : null,
    salaryStructure: access.compensation ? { packages: input.packages } : null,
    advances: access.payroll
      ? {
          total: Math.round(input.advances.reduce((sum, row) => sum + row.amount, 0) * 100) / 100,
          rows: input.advances,
        }
      : null,
    fines: access.payroll
      ? {
          total: Math.round(input.fines.reduce((sum, row) => sum + row.amount, 0) * 100) / 100,
          rows: input.fines,
        }
      : null,
    warnings: input.warnings,
    visaPeriods: access.visa ? input.visaPeriods : null,
    documents: access.documents ? input.documents : null,
  };
}
