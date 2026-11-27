import * as XLSX from 'xlsx';

import { absentDateRows } from '@/lib/hr/employeeHistory';
import { formatLeaveTypeCount, type EmployeeHistoryReport } from '@/lib/hr/employeeHistoryReport';
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
  if (show('absent') && block) {
    const rows: Array<Array<string | number | null>> = [
      ['Total absent days', block.absentDays],
      ['Unauthorised', block.unauthorisedDays],
    ];
    if (absentDateRows(block).length > 0) {
      rows.push(['Absent date', 'Note']);
      for (const row of absentDateRows(block)) rows.push([row.date, row.note]);
    }
    for (const [type, days] of [
      ['Unauthorised', block.exceptions.unauthorised],
      ['Absent', block.exceptions.overstay],
    ] as const) {
      for (const day of days) rows.push([type, day.date, day.status, day.remark]);
    }
    if (!show('leave')) rows.push(['Note', 'Approved leave is not counted as absent.']);
    addSheet(workbook, 'Absent', rows);
  }

  if (show('leave') && block) {
    const typeRows = block.leaveTypeCounts.length > 0
      ? block.leaveTypeCounts.map((row) => [row.label, '', '', formatLeaveTypeCount(row.usedDays, row.allowance)])
      : [
          ['Sick days', '', '', block.sickDays],
          ['Paid days', '', '', block.paidDays],
          ['Unpaid days', '', '', block.unpaidDays],
          ['Annual days', '', '', block.annualDays],
        ];
    const leaveRows: Array<Array<string | number | null>> = [
      ...typeRows,
      ...(block.leaveTypeCounts.length === 0 ? block.otherLeave.map((row) => [row.name, '', '', row.days]) : []),
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
    const data = report.pay.lines.map((row) => [row.month, row.unpaidAbsentDays, row.otPay, row.gross]);
    if (data.length === 0) addSheet(workbook, 'Pay runs', [['No rows']]);
    else {
      const rows: Array<Array<string | number | null>> = [
        ['Month', 'Absent days in this pay run', 'Overtime pay', 'Gross'],
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
