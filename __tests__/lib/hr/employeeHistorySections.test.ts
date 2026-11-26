import * as XLSX from 'xlsx';

import { buildEmployeeHistory } from '@/lib/hr/employeeHistory';
import type { EmployeeHistoryReport } from '@/lib/hr/employeeHistoryReport';
import { documentOverlapsHistoryRange, parseHistorySections, allowedHistorySections } from '@/lib/hr/employeeHistorySections';
import { buildEmployeeHistoryWorkbook } from '@/lib/hr/employeeHistoryWorkbook';

const from = '2026-10-01';
const to = '2026-10-31';

function sheetNames(report: EmployeeHistoryReport, sections: Parameters<typeof buildEmployeeHistoryWorkbook>[1]) {
  return XLSX.read(buildEmployeeHistoryWorkbook(report, sections)).SheetNames;
}

function report(): EmployeeHistoryReport {
  const counts = buildEmployeeHistory({ from, to, attendance: [], leaves: [] });
  return {
    employee: {
      id: 'emp',
      fullName: 'Rehan Iqbal',
      preferredName: null,
      employeeCode: 'AMFGI-0008',
      status: 'ACTIVE',
      designation: null,
      department: null,
      employmentType: null,
      hireDate: '2024-03-26',
      terminationDate: null,
      serviceLabel: '2 yrs',
      adminNotes: null,
      companyName: 'Almuraqib',
      email: null,
      phone: null,
      nationality: null,
      dateOfBirth: null,
      gender: null,
      bloodGroup: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
    },
    documents: { records: [], extraFiles: [] },
    range: { from, to },
    rangeNote: null,
    attendanceAndLeaveMessage: null,
    attendanceAndLeave: { ...counts, leaveTypeCounts: [] },
    pay: { wholeMonths: true, lines: [] },
    salaryStructure: { packages: [] },
    advances: { total: 0, rows: [] },
    fines: { total: 0, rows: [] },
    warnings: [],
    visaPeriods: [],
  };
}

describe('documentOverlapsHistoryRange', () => {
  it('keeps a document that is valid on a day inside the range', () => {
    expect(
      documentOverlapsHistoryRange({
        issueDate: '2025-01-01',
        expiryDate: '2027-12-31',
        from,
        to,
        fullHistory: false,
      })
    ).toBe(true);
  });

  it('drops a document that expires before the range starts', () => {
    expect(
      documentOverlapsHistoryRange({
        issueDate: '2025-01-01',
        expiryDate: '2026-09-30',
        from,
        to,
        fullHistory: false,
      })
    ).toBe(false);
  });

  it('keeps a document with no dates only on the full history', () => {
    expect(documentOverlapsHistoryRange({ issueDate: null, expiryDate: null, from, to, fullHistory: true })).toBe(true);
    expect(documentOverlapsHistoryRange({ issueDate: null, expiryDate: null, from, to, fullHistory: false })).toBe(false);
  });
});

describe('allowedHistorySections', () => {
  it('omits documents and visa when the user cannot view them', () => {
    const sections = allowedHistorySections({
      attendanceAndLeave: true,
      payroll: true,
      compensation: true,
      visa: false,
      documents: false,
    });
    expect(sections).not.toContain('documents');
    expect(sections).not.toContain('visa');
    expect(sections).toContain('absent');
    expect(sections).not.toContain('attendance');
    expect(sections).toContain('warnings');
    expect(sections).toContain('fines');
  });

  it('hides fines without payroll access', () => {
    const sections = allowedHistorySections({
      attendanceAndLeave: true,
      payroll: false,
      compensation: true,
      visa: true,
      documents: true,
    });
    expect(sections).not.toContain('fines');
    expect(sections).not.toContain('advances');
  });
});

describe('history workbook sections', () => {
  it('treats a missing sections value as everything and an empty value as basic info only', () => {
    expect(parseHistorySections(null)).toBe('all');
    expect(parseHistorySections('')).toEqual([]);
    expect(parseHistorySections('none')).toEqual([]);
  });

  it('opens the absent section when an old link still asks for attendance', () => {
    expect(parseHistorySections('attendance,leave')).toEqual(['absent', 'leave']);
  });

  it('writes only the summary when no section is selected', () => {
    expect(sheetNames(report(), [])).toEqual(['Summary']);
    expect(sheetNames(report(), parseHistorySections('none'))).toEqual(['Summary']);
  });

  it('drops the attendance day section from old links', () => {
    expect(parseHistorySections('attendanceDays,leave')).toEqual(['leave']);
    expect(sheetNames(report(), 'all')).not.toContain('Attendance');
  });

  it('omits the absent sheet when only leave is selected', () => {
    const names = sheetNames(report(), ['leave']);
    expect(names).toContain('Leave');
    expect(names).not.toContain('Attendance');
    expect(names).not.toContain('Absent');
  });

  it('writes total absent days on the absent sheet', () => {
    const names = sheetNames(report(), parseHistorySections('attendance'));
    expect(names).toContain('Absent');
    expect(names).not.toContain('Attendance totals');
    const rows = XLSX.utils.sheet_to_json(XLSX.read(buildEmployeeHistoryWorkbook(report(), ['absent'])).Sheets.Absent, { header: 1 });
    expect(rows[0]).toEqual(['Total absent days', 0]);
  });

  it('writes approved fines with their total columns', () => {
    const data = report();
    data.fines = {
      total: 25,
      rows: [{ id: 'fine', date: '2026-11-17', amount: 25, description: 'Late arrival' }],
    };
    const rows = XLSX.utils.sheet_to_json(XLSX.read(buildEmployeeHistoryWorkbook(data, ['fines'])).Sheets.Fines, { header: 1 });
    expect(rows[0]).toEqual(['Date', 'Amount', 'Description']);
    expect(rows[1]).toEqual(['2026-11-17', 25, 'Late arrival']);
  });

  it('keeps a sheet for a selected section that has no rows', () => {
    const book = XLSX.read(buildEmployeeHistoryWorkbook(report(), ['warnings']));
    expect(book.SheetNames).toEqual(['Summary', 'Warnings']);
    expect(XLSX.utils.sheet_to_json(book.Sheets.Warnings, { header: 1 })).toEqual([['No rows']]);
  });

  it('writes an empty pay run as No rows and keeps the partial-month note with real rows', () => {
    const empty = report();
    empty.pay = { wholeMonths: false, lines: [] };
    const emptyBook = XLSX.read(buildEmployeeHistoryWorkbook(empty, ['pay']));
    expect(XLSX.utils.sheet_to_json(emptyBook.Sheets['Pay runs'], { header: 1 })).toEqual([['No rows']]);

    const withLine = report();
    withLine.pay = {
      wholeMonths: false,
      lines: [{ month: '2026-10', gross: 100, unpaidAbsentDays: 1, componentDeduction: null, otPay: null, deductionDetailStored: false }],
    };
    const rows = XLSX.utils.sheet_to_json(XLSX.read(buildEmployeeHistoryWorkbook(withLine, ['pay'])).Sheets['Pay runs'], { header: 1 });
    expect(rows[0]).toEqual(['Full finalized month, not cut to the selected days.']);
    expect(rows[1]).toEqual(['Month', 'Absent days in this pay run', 'Overtime pay', 'Gross']);
    expect(rows[2]?.[0]).toBe('2026-10');
  });

  it('says a missing pay-run deduction was not stored', () => {
    const data = report();
    data.pay = {
      wholeMonths: true,
      lines: [{ month: '2026-10', gross: 100, unpaidAbsentDays: null, componentDeduction: null, otPay: null, deductionDetailStored: false }],
    };
    const rows = XLSX.utils.sheet_to_json(XLSX.read(buildEmployeeHistoryWorkbook(data, ['deductions'])).Sheets.Deductions, { header: 1 }) as unknown[][];
    expect(rows.some((row) => row.includes('Not stored'))).toBe(true);
    expect(rows.some((row) => row.includes(0))).toBe(false);
  });

  it('leaves the visa column off a document sheet when the user cannot view visas', () => {
    const data = report();
    data.visaPeriods = null;
    data.documents = {
      records: [{ id: 'doc', typeName: 'Passport', number: 'P1', issueDate: '2025-01-01', expiryDate: '2027-01-01', authority: 'Home', visaLabel: null }],
      extraFiles: [],
    };
    const rows = XLSX.utils.sheet_to_json(XLSX.read(buildEmployeeHistoryWorkbook(data, ['documents'])).Sheets.Documents, { header: 1 }) as unknown[][];
    expect(rows[0]).toEqual(['Name', 'Number', 'Issue or upload', 'Expiry', 'Authority']);
  });
});
