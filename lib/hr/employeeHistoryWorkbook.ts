import * as XLSX from 'xlsx';

import { absentDateRows } from '@/lib/hr/employeeHistory';
import type { EmployeeHistoryReport } from '@/lib/hr/employeeHistoryReport';
import { sectionSelected, type HistorySectionSelection } from '@/lib/hr/employeeHistorySections';

function addSheet(workbook: XLSX.WorkBook, name: string, rows: Array<Array<string | number | null>>) {
  const sheet = XLSX.utils.aoa_to_sheet(rows.length > 0 ? rows : [['No rows']]);
  XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
}

function addDataSheet(
  workbook: XLSX.WorkBook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number | null>>
) {
  addSheet(workbook, name, rows.length > 0 ? [headers, ...rows] : [['No rows']]);
}

export function buildEmployeeHistoryWorkbook(
  report: EmployeeHistoryReport,
  sections: HistorySectionSelection = 'all'
): Buffer {
  const workbook = XLSX.utils.book_new();
  const employee = report.employee;
  const show = (section: Parameters<typeof sectionSelected>[1]) => sectionSelected(sections, section);
  addSheet(workbook, 'Summary', [
    ['Company', employee.companyName],
    ['Employee', employee.fullName],
    ['Code', employee.employeeCode],
    ['Status', employee.status],
    ['Designation', employee.designation],
    ['Department', employee.department],
    ['Employment type', employee.employmentType],
    ['Joining date', employee.hireDate],
    ['Termination date', employee.terminationDate],
    ['Service', employee.serviceLabel],
    ['Period', report.range ? `${report.range.from} to ${report.range.to}` : null],
    ['Note', report.rangeNote],
    ['HR notes', employee.adminNotes],
  ]);

  if (show('personal')) {
    addSheet(workbook, 'Personal', [
      ['Email', employee.email],
      ['Phone', employee.phone],
      ['Nationality', employee.nationality],
      ['Date of birth', employee.dateOfBirth],
      ['Gender', employee.gender],
      ['Blood group', employee.bloodGroup],
      ['Emergency contact', employee.emergencyContactName],
      ['Emergency phone', employee.emergencyContactPhone],
    ]);
  }

  const block = report.attendanceAndLeave;
  if (show('attendance') && block) {
    const totals: Array<Array<string | number | null>> = [
      ['Worked days', block.workedDays],
      ['Half days', block.halfDays],
      ['Total absent', block.absentDays],
      ...(absentDateRows(block).length > 0
        ? [['Absent date', 'Note'], ...absentDateRows(block).map((row) => [row.date, row.note])]
        : []),
      ['Unauthorised', block.unauthorisedDays],
      ['Overstay', block.overstayDays],
      ['Missing punch days', block.missingPunchDays],
      ['Late days', block.lateDays],
      ['Late minutes', block.lateMinutes],
      ['Early days', block.earlyDays],
      ['Early minutes', block.earlyMinutes],
      ['Overtime minutes', block.overtimeMinutes],
    ];
    if (!show('leave')) totals.push(['Note', 'Approved leave is not counted as worked or absent.']);
    addSheet(workbook, 'Attendance totals', totals);
    const exceptionRows: Array<Array<string | number | null>> = [];
    for (const [type, rows] of [
      ['Late', block.exceptions.late],
      ['Early', block.exceptions.early],
      ['Unauthorised', block.exceptions.unauthorised],
      ['Missing punch', block.exceptions.missingPunch],
      ['Overstay', block.exceptions.overstay],
    ] as const) {
      for (const row of rows) {
        exceptionRows.push([type, row.date, row.status, row.lateMinutes, row.earlyLeaveMinutes, row.overtimeMinutes]);
      }
    }
    addDataSheet(workbook, 'Exceptions', ['Type', 'Date', 'Status', 'Late minutes', 'Early minutes', 'Overtime minutes'], exceptionRows);
  }

  if (show('attendanceDays') && block?.attendanceDays) {
    addDataSheet(
      workbook,
      'Attendance',
      ['Date', 'Status', 'Counted as', 'Late minutes', 'Early minutes', 'Overtime minutes', 'Note'],
      block.attendanceDays.map((row) => [row.date, row.status, row.countedAs, row.lateMinutes, row.earlyLeaveMinutes, row.overtimeMinutes, row.remark])
    );
  }

  if (show('leave') && block) {
    const leaveRows: Array<Array<string | number | null>> = [
      ['Sick days', '', '', block.sickDays],
      ['Paid days', '', '', block.paidDays],
      ['Unpaid days', '', '', block.unpaidDays],
      ['Annual days', '', '', block.annualDays],
      ['Return not marked', '', '', block.returnNotMarked],
      ...block.otherLeave.map((row) => [row.name, '', '', row.days]),
      ...block.leaves.map((row) => [row.typeName, row.startDate, row.endDate, row.days, row.notes.map((note) => `${note.date} ${note.note}`).join('; ')]),
    ];
    addDataSheet(workbook, 'Leave', ['Type', 'Start', 'End', 'Days', 'Reason'], leaveRows.map((row) => {
      const reason = row.length > 4 ? row[4] : '';
      return [row[0], row[1], row[2], row[3], reason];
    }));
  }

  if (show('salary') && report.salaryStructure) {
    addDataSheet(
      workbook,
      'Salary structure',
      ['Pay type', 'From', 'To', 'Monthly basic', 'Daily rate'],
      report.salaryStructure.packages.map((pkg) => [pkg.payTypeName, pkg.effectiveFrom, pkg.effectiveTo, pkg.monthlyBasic, pkg.dailyRate])
    );
  }

  if (show('deductions') && (report.salaryStructure || report.pay)) {
    const rows: Array<Array<string | number | null>> = [];
    for (const pkg of report.salaryStructure?.packages ?? []) {
      for (const deduction of pkg.deductions) {
        rows.push([pkg.payTypeName, pkg.effectiveFrom, deduction.name, deduction.amount, deduction.applicationMode === 'FIXED_MONTHLY' ? 'fixed monthly' : 'attendance']);
      }
    }
    for (const line of report.pay?.lines ?? []) {
      rows.push([line.month, '', 'Attendance deduction in this pay run', line.deductionDetailStored ? line.componentDeduction : 'Not stored', 'pay run']);
    }
    addDataSheet(workbook, 'Deductions', ['Source', 'From', 'Name', 'Amount', 'Mode'], rows);
  }

  if (show('pay') && report.pay) {
    const data = report.pay.lines.map((row) => [row.month, row.gross, row.unpaidAbsentDays, row.otPay]);
    if (data.length === 0) addSheet(workbook, 'Pay runs', [['No rows']]);
    else {
      const rows: Array<Array<string | number | null>> = [
        ['Month', 'Gross', 'Absent days in this pay run', 'Overtime pay'],
        ...data,
      ];
      if (!report.pay.wholeMonths) rows.unshift(['Full finalized month, not cut to the selected days.']);
      addSheet(workbook, 'Pay runs', rows);
    }
  }

  if (show('advances') && report.advances) {
    addDataSheet(
      workbook,
      'Advances',
      ['Date', 'Amount', 'Note'],
      report.advances.rows.map((row) => [row.date, row.amount, row.note])
    );
  }

  if (show('fines') && report.fines) {
    addDataSheet(
      workbook,
      'Fines',
      ['Date', 'Amount', 'Description'],
      report.fines.rows.map((row) => [row.date, row.amount, row.description])
    );
  }

  if (show('visa') && report.visaPeriods) {
    addDataSheet(
      workbook,
      'Visa',
      ['Label', 'Start', 'End', 'Status'],
      report.visaPeriods.map((row) => [row.label, row.startDate, row.endDate, row.status])
    );
  }

  if (show('documents') && report.documents) {
    const visaColumn = report.visaPeriods != null;
    const headers = ['Name', 'Number', 'Issue or upload', 'Expiry', 'Authority', ...(visaColumn ? ['Visa'] : [])];
    const rows: Array<Array<string | number | null>> = [
      ...report.documents.records.map((row) => [row.typeName, row.number, row.issueDate, row.expiryDate, row.authority, ...(visaColumn ? [row.visaLabel] : [])]),
      ...report.documents.extraFiles.map((row) => [row.fileName, '', row.uploadedOn, '', '', ...(visaColumn ? [''] : [])]),
    ];
    addDataSheet(workbook, 'Documents', headers, rows);
  }

  if (show('warnings')) {
    addDataSheet(
      workbook,
      'Warnings',
      ['Date', 'Note'],
      report.warnings.map((row) => [row.date, row.note])
    );
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
