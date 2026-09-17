import * as XLSX from 'xlsx';

import {
  buildPayPreviewWorkbook,
  buildPayPreviewWorkbookSheets,
  type PayPreviewExportPayload,
} from '@/lib/hr/payroll/exportPayPreviewXlsx';

const samplePayload: PayPreviewExportPayload = {
  month: '2026-06',
  totalGross: 3500,
  employees: [
    {
      employeeId: 'e1',
      employeeCode: 'EMP001',
      employeeName: 'Jane Doe',
      employeeFullName: 'Jane Doe',
      employeePreferredName: 'Jane',
      payTypeName: 'Office',
      payTypeCode: 'OFFICE',
      workforceRoleTypeShort: 'Office',
      visaHoldingLabel: 'Company provided',
      wpsTransferAmount: 2800,
      visaSponsorName: 'Company A',
      gross: 3500,
      breakdown: { monthlyBasic: 3000, deductions: 0 },
      salaryComponentEarnings: 200,
      salaryComponentDeductions: 50,
      dayDetails: [
        {
          date: '2026-06-02',
          status: 'Present',
          totalHours: 9,
          basicHours: 8,
          otHours: 1,
          basicHourRate: 15,
          basicHourSalary: 120,
          otHourRate: 22.5,
          otHourSalary: 22.5,
          allowance: 10,
          componentEarning: 10,
          componentDeduction: 5,
          totalSalary: 147.5,
          amount: 147.5,
        },
      ],
      healthCheck: {
        ok: true,
        issues: [],
        basicPaid: 3000,
        basicCap: 3000,
        allowancePaid: 200,
        allowanceCap: 200,
        componentEarningsPaid: 200,
        componentEarningsCap: 200,
        componentDeductionsPaid: 50,
        componentDeductionsCap: 50,
      },
      approvedAttendanceRows: 1,
      draftAttendanceRows: 0,
      skipped: false,
      skipReason: null,
    },
    {
      employeeId: 'e2',
      employeeCode: 'EMP002',
      employeeName: 'John Smith',
      payTypeName: null,
      payTypeCode: null,
      gross: 0,
      breakdown: {},
      approvedAttendanceRows: 0,
      draftAttendanceRows: 0,
      skipped: true,
      skipReason: 'No compensation',
    },
  ],
};

function sheetToRows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as Array<Array<string | number>>;
}

describe('buildPayPreviewWorkbookSheets', () => {
  it('creates summary sheet and one sheet per included employee', () => {
    const sheets = buildPayPreviewWorkbookSheets(samplePayload);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]?.name).toBe('Summary');
    expect(sheets[1]?.name).toBe('Jane Doe');
  });

  it('summary sheet mirrors preview table columns', () => {
    const sheets = buildPayPreviewWorkbookSheets(samplePayload);
    const summaryRows = sheets[0]?.rows ?? [];
    expect(summaryRows[0]).toEqual(['Payroll preview', '2026-06']);
    expect(summaryRows[4]?.[0]).toBe('Employee');
    expect(summaryRows[4]).toContain('Role');
    expect(summaryRows[4]).toContain('Visa sponsor');
    expect(summaryRows[4]).toContain('WPS (AED)');
    expect(summaryRows[5]?.[0]).toBe('Jane Doe');
    expect(summaryRows[4]).toContain('Visa holding');
    expect(summaryRows[5]?.[2]).toBe('Office');
    expect(summaryRows[5]?.[3]).toBe('Company provided');
    expect(summaryRows[5]?.[4]).toBe('Company A');
    expect(summaryRows[5]?.[14]).toBe(2800);
    expect(summaryRows[5]?.[15]).toBe(3500);
    expect(summaryRows.some((row) => row[0] === 'Skipped employees')).toBe(true);
  });

  it('employee sheet includes daily breakdown headers', () => {
    const sheets = buildPayPreviewWorkbookSheets(samplePayload);
    const detailRows = sheets[1]?.rows ?? [];
    const dailyHeaderIndex = detailRows.findIndex((row) => row[0] === 'Date');
    expect(dailyHeaderIndex).toBeGreaterThan(-1);
    expect(detailRows[dailyHeaderIndex]).toEqual([
      'Date',
      'Total h',
      'Basic h',
      'OT h',
      'Basic salary',
      'OT rate',
      'OT salary',
      'Allowance',
      'Deduction',
      'Total',
      'Status',
    ]);
    expect(detailRows[dailyHeaderIndex + 1]?.[0]).toBe('2026-06-02');
  });

  it('produces a valid xlsx workbook', () => {
    const sheets = buildPayPreviewWorkbookSheets(samplePayload);
    const workbook = XLSX.utils.book_new();
    for (const sheet of sheets) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
    }
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const parsed = XLSX.read(buffer, { type: 'buffer' });
    expect(parsed.SheetNames).toEqual(['Summary', 'Jane Doe']);
    const summary = sheetToRows(parsed.Sheets.Summary);
    expect(summary[5]?.[0]).toBe('Jane Doe');
  });

  it('omits unselected summary columns and employee sheets when disabled', () => {
    const sheets = buildPayPreviewWorkbookSheets(samplePayload, {
      summaryColumns: ['employeeCode', 'gross'],
      sections: ['skippedEmployees'],
      dayColumns: [],
    });
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.rows[4]).toEqual(['Employee', 'Employee code', 'Gross (AED)']);
    expect(sheets[0]?.rows[5]).toEqual(['Jane Doe', 'EMP001', 3500]);
    expect(sheets[0]?.rows.some((row) => row[0] === 'Skipped employees')).toBe(true);
  });

  it('limits daily breakdown columns when selected', () => {
    const sheets = buildPayPreviewWorkbookSheets(samplePayload, {
      summaryColumns: ['gross'],
      sections: ['employeeSheets', 'dailyBreakdown'],
      dayColumns: ['totalHours', 'status'],
    });
    const detailRows = sheets[1]?.rows ?? [];
    const dailyHeaderIndex = detailRows.findIndex((row) => row[0] === 'Date');
    expect(detailRows[dailyHeaderIndex]).toEqual(['Date', 'Total h', 'Status']);
    expect(detailRows[dailyHeaderIndex + 1]).toEqual(['2026-06-02', 9, 'Present']);
  });

  it('exports only selected employee-sheet fields', () => {
    const sheets = buildPayPreviewWorkbookSheets(samplePayload, {
      summaryColumns: ['gross'],
      sections: ['employeeSheets'],
      detailFields: ['employeeCode', 'gross'],
      salaryComponentFields: ['fixedEarnings'],
      breakdownFields: ['monthlyBasic'],
      healthFields: ['status'],
      dayColumns: [],
    });
    const detailRows = sheets[1]?.rows ?? [];
    expect(detailRows.some((row) => row[0] === 'Employee code' && row[1] === 'EMP001')).toBe(true);
    expect(detailRows.some((row) => row[0] === 'Preferred name')).toBe(false);
    expect(detailRows.some((row) => row[0] === 'Fixed earnings')).toBe(true);
    expect(detailRows.some((row) => row[0] === 'Attendance earnings')).toBe(false);
    expect(detailRows.some((row) => row[0] === 'Monthly basic')).toBe(true);
    expect(detailRows.some((row) => row[0] === 'Absence deductions')).toBe(false);
    expect(detailRows.some((row) => row[0] === 'Status' && row[1] === 'OK')).toBe(true);
    expect(detailRows.some((row) => row[0] === 'Basic paid / cap')).toBe(false);
    expect(detailRows.some((row) => row[0] === 'Daily breakdown')).toBe(false);
  });

  it('omits exited or suspended employees with no attendance from export workbook', () => {
    const sheets = buildPayPreviewWorkbookSheets({
      month: '2026-06',
      totalGross: 4500,
      employees: [
        {
          ...samplePayload.employees[0]!,
          employeeStatus: 'ACTIVE',
        },
        {
          employeeId: 'e3',
          employeeCode: 'EMP003',
          employeeName: 'Exited Worker',
          employeeFullName: 'Exited Worker',
          employeeStatus: 'EXITED',
          payTypeName: 'Office',
          payTypeCode: 'OFFICE',
          gross: 1000,
          breakdown: {},
          approvedAttendanceRows: 0,
          draftAttendanceRows: 0,
          skipped: false,
          skipReason: null,
        },
        {
          employeeId: 'e4',
          employeeCode: 'EMP004',
          employeeName: 'Suspended Worker',
          employeeFullName: 'Suspended Worker',
          employeeStatus: 'SUSPENDED',
          payTypeName: 'Office',
          payTypeCode: 'OFFICE',
          gross: 900,
          breakdown: {},
          approvedAttendanceRows: 2,
          draftAttendanceRows: 0,
          skipped: false,
          skipReason: null,
          dayDetails: samplePayload.employees[0]!.dayDetails,
        },
      ],
    });

    expect(sheets[0]?.rows.some((row) => row[0] === 'Exited Worker')).toBe(false);
    expect(sheets[0]?.rows.some((row) => row[0] === 'Suspended Worker')).toBe(true);
    expect(sheets[0]?.rows.some((row) => row[0] === 'Jane Doe')).toBe(true);
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Summary', 'Jane Doe', 'Suspended Worker']);
  });

  it('links each employee on the Summary index to their sheet', () => {
    const workbook = buildPayPreviewWorkbook(samplePayload);
    const summarySheet = workbook.Sheets.Summary;
    const employeeLink = summarySheet.A6;
    expect(employeeLink?.v).toBe('Jane Doe');
    expect(employeeLink?.f).toBe("=HYPERLINK(\"#'Jane Doe'!A1\",\"Jane Doe\")");
    expect(employeeLink?.l?.Target).toBe("#'Jane Doe'!A1");

    const backLink = workbook.Sheets['Jane Doe']?.C1;
    expect(backLink?.v).toBe('Summary');
    expect(backLink?.f).toBe('=HYPERLINK("#Summary!A1","Summary")');
    expect(backLink?.l?.Target).toBe('#Summary!A1');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const xml = buffer.toString('utf8');
    expect(xml).toContain('<hyperlink');
    expect(xml).toContain("Jane Doe");
    expect(xml).toContain('!A1');
  });

  it('applies workbook styles to title and header cells', () => {
    const workbook = buildPayPreviewWorkbook(samplePayload);
    const summary = workbook.Sheets.Summary;
    expect(summary.A1?.s?.font?.bold).toBe(true);
    expect(summary.A1?.s?.fill?.fgColor?.rgb).toBe('1E3A5F');
    expect(summary.A5?.s?.font?.bold).toBe(true);
    expect(summary.A5?.s?.fill?.fgColor?.rgb).toBe('334155');
    expect(summary.A6?.s?.font?.color?.rgb).toBe('1D4ED8');
  });
});
