import * as XLSX from 'xlsx-js-style';

import { daysInMonth } from '@/lib/hr/payroll/calendar';
import { formatPayMoney } from '@/lib/hr/payroll/payslipFormatting';
import { isPayPreviewPendingCompensationRow, shouldOmitInactiveEmployeeFromPayExport } from '@/lib/hr/payroll/payPreviewRowStatus';
import {
  DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS,
  hasPayPreviewDetailField,
  hasPayPreviewExportSection,
  hasPayPreviewHealthField,
  hasPayPreviewSalaryComponentField,
  isBreakdownKeySelected,
  normalizePayPreviewExportOptions,
  PAY_PREVIEW_DAY_COLUMNS,
  PAY_PREVIEW_SUMMARY_COLUMNS,
  type PayPreviewDayColumnKey,
  type PayPreviewDetailFieldKey,
  type PayPreviewExportOptions,
  type PayPreviewSummaryColumnKey,
} from '@/lib/hr/payroll/payPreviewExportConfig';
import {
  applyPayPreviewWorksheetStyles,
  stylePayPreviewHyperlink,
  type PayPreviewRowStyleHint,
  type PayPreviewSheetModel,
} from '@/lib/hr/payroll/payPreviewXlsxStyles';
import { sanitizeSheetName } from '@/lib/import-export/xlsx';

const SUMMARY_SHEET_NAME = 'Summary';
const SUMMARY_META_ROW_COUNT = 4;

export type PayPreviewExportDayDetail = {
  date: string;
  status: string;
  totalHours: number;
  basicHours: number;
  otHours: number;
  basicHourRate: number;
  basicHourSalary: number;
  otHourRate: number;
  otHourSalary: number;
  allowance: number;
  componentEarning?: number;
  componentDeduction?: number;
  totalSalary: number;
  amount: number;
  detail?: string;
};

export type PayPreviewExportEmployee = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeFullName?: string;
  employeePreferredName?: string | null;
  employeeStatus?: string | null;
  payTypeName: string | null;
  payTypeCode: string | null;
  workforceRoleTypeShort?: string;
  visaHoldingLabel?: string;
  wpsTransferAmount?: number | null;
  visaSponsorName?: string | null;
  gross: number;
  breakdown: Record<string, number>;
  salaryComponentEarnings?: number;
  salaryComponentDeductions?: number;
  dayDetails?: PayPreviewExportDayDetail[];
  healthCheck?: {
    ok: boolean;
    issues: string[];
    basicPaid: number;
    basicCap: number;
    allowancePaid: number;
    allowanceCap: number;
    componentEarningsPaid: number;
    componentEarningsCap: number;
    componentDeductionsPaid: number;
    componentDeductionsCap: number;
  } | null;
  approvedAttendanceRows: number;
  draftAttendanceRows: number;
  skipped: boolean;
  skipReason: string | null;
};

export type PayPreviewExportPayload = {
  month: string;
  totalGross: number;
  employees: PayPreviewExportEmployee[];
};

const HIDDEN_BREAKDOWN_KEYS = new Set(['salaryComponentsFixed', 'salaryComponentsAttendance']);

const BREAKDOWN_LABELS: Record<string, string> = {
  monthlyBasic: 'Monthly basic',
  deductions: 'Absence deductions',
  deductDays: 'Absent days deducted',
  deductDaysInMonth: 'Deduct days in month',
  earnedDays: 'Earned days',
  unpaidAbsentDays: 'Unpaid absent days',
  dailyRate: 'Daily rate',
  dailyWageTotal: 'Daily wage total',
  hourlyTotal: 'Hourly total',
  outsideCapOt: 'Outside-cap OT',
  holidayWorkedOt: 'Holiday worked OT',
  excludedWeekdayOt: 'Weekly off OT',
};

const MONEY_SUMMARY_COLUMNS = new Set<PayPreviewSummaryColumnKey>([
  'basicSalary',
  'otSalary',
  'allowance',
  'deduction',
  'wps',
  'gross',
]);

const MONEY_DETAIL_FIELDS = new Set<PayPreviewDetailFieldKey>([
  'wps',
  'gross',
  'basicSalary',
  'otSalary',
  'allowance',
  'deduction',
]);

const MONEY_DAY_COLUMNS = new Set<PayPreviewDayColumnKey>([
  'basicSalary',
  'otRate',
  'otSalary',
  'allowance',
  'deduction',
  'total',
]);

const SUMMARY_COLUMN_LABELS: Record<PayPreviewSummaryColumnKey, string> = Object.fromEntries(
  PAY_PREVIEW_SUMMARY_COLUMNS.map((column) => [column.key, column.label])
) as Record<PayPreviewSummaryColumnKey, string>;

const DAY_COLUMN_LABELS: Record<PayPreviewDayColumnKey, string> = Object.fromEntries(
  PAY_PREVIEW_DAY_COLUMNS.map((column) => [column.key, column.label])
) as Record<PayPreviewDayColumnKey, string>;

function formatHours(n: number | null | undefined) {
  const value = Number(n);
  return (Number.isFinite(value) ? value : 0).toLocaleString('en-AE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function breakdownLabel(key: string) {
  return BREAKDOWN_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

function resolveDisplayFullName(row: PayPreviewExportEmployee): string {
  return row.employeeFullName?.trim() || row.employeeName;
}

function resolveAllowanceTotal(row: PayPreviewExportEmployee): number {
  if (row.salaryComponentEarnings != null) return row.salaryComponentEarnings;
  if (row.healthCheck?.componentEarningsPaid != null) return row.healthCheck.componentEarningsPaid;
  if (row.healthCheck?.allowancePaid != null) return row.healthCheck.allowancePaid;
  const days = row.dayDetails ?? [];
  return (
    days.reduce((sum, day) => sum + (day.componentEarning ?? Math.max(0, day.allowance ?? 0)), 0) +
    (row.breakdown.salaryComponentsFixed ?? 0) +
    (row.breakdown.salaryComponentsAttendance ?? 0)
  );
}

function resolveDeductionTotal(row: PayPreviewExportEmployee): number {
  if (row.salaryComponentDeductions != null) return row.salaryComponentDeductions;
  if (row.healthCheck?.componentDeductionsPaid != null) return row.healthCheck.componentDeductionsPaid;
  const days = row.dayDetails ?? [];
  return days.reduce((sum, day) => sum + (day.componentDeduction ?? 0), 0);
}

function summarizeEmployeeRow(row: PayPreviewExportEmployee) {
  const days = row.dayDetails ?? [];
  const activeDays = days.filter((day) => (day.totalHours ?? 0) > 0 || (day.totalSalary ?? 0) > 0).length;
  return {
    totalHours: days.reduce((sum, day) => sum + (day.totalHours ?? 0), 0),
    totalOt: days.reduce((sum, day) => sum + (day.otHours ?? 0), 0),
    basicSalary: days.reduce((sum, day) => sum + (day.basicHourSalary ?? 0), 0),
    otSalary: days.reduce((sum, day) => sum + (day.otHourSalary ?? 0), 0),
    allowance: resolveAllowanceTotal(row),
    deduction: resolveDeductionTotal(row),
    activeDays,
  };
}

function attendanceOutOfLabel(row: PayPreviewExportEmployee, month: string): string {
  const monthDays = daysInMonth(month);
  const saved = row.approvedAttendanceRows;
  if (saved > 0) {
    const summary = summarizeEmployeeRow(row);
    return `${summary.activeDays} / ${saved}`;
  }
  return `0 / ${monthDays}`;
}

function summarizeDayComponentTotals(rows: PayPreviewExportDayDetail[]) {
  return rows.reduce(
    (acc, day) => {
      acc.earnings += day.componentEarning ?? Math.max(0, day.allowance);
      acc.deductions += day.componentDeduction ?? 0;
      acc.basicSalary += day.basicHourSalary;
      acc.otSalary += day.otHourSalary;
      acc.totalSalary += day.totalSalary;
      return acc;
    },
    { earnings: 0, deductions: 0, basicSalary: 0, otSalary: 0, totalSalary: 0 }
  );
}

function resolveSalaryComponentBreakdown(row: PayPreviewExportEmployee, dayRows: PayPreviewExportDayDetail[]) {
  const dayTotals = summarizeDayComponentTotals(dayRows);
  const totalEarnings = resolveAllowanceTotal(row);
  const totalDeductions = resolveDeductionTotal(row);
  return {
    fixedEarnings: Math.max(0, totalEarnings - dayTotals.earnings),
    fixedDeductions: Math.max(0, totalDeductions - dayTotals.deductions),
    attendanceEarnings: dayTotals.earnings,
    attendanceDeductions: dayTotals.deductions,
    totalEarnings,
    totalDeductions,
  };
}

function visibleBreakdownEntries(breakdown: Record<string, number>) {
  return Object.entries(breakdown).filter(([key]) => !HIDDEN_BREAKDOWN_KEYS.has(key));
}

function formatBreakdownValue(key: string, value: number) {
  if (key === 'deductDays' || key === 'earnedDays' || key === 'deductDaysInMonth' || key === 'unpaidAbsentDays') {
    return String(value);
  }
  return formatPayMoney(value);
}

function isMoneyBreakdownKey(key: string) {
  return !(
    key === 'deductDays' ||
    key === 'earnedDays' ||
    key === 'deductDaysInMonth' ||
    key === 'unpaidAbsentDays'
  );
}

function excelSheetReference(sheetName: string) {
  const needsQuotes = /[\s'[\]\\/?*:]|^'|'$/.test(sheetName);
  if (!needsQuotes) return sheetName;
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function excelInternalSheetLink(sheetName: string) {
  return `#${excelSheetReference(sheetName)}!A1`;
}

function escapeExcelFormulaString(value: string) {
  return value.replace(/"/g, '""');
}

function setWorksheetHyperlink(
  worksheet: XLSX.WorkSheet,
  row: number,
  col: number,
  display: string,
  targetSheetName: string
) {
  const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
  const target = excelInternalSheetLink(targetSheetName);
  const existing = worksheet[cellRef];
  worksheet[cellRef] = {
    ...(existing ?? {}),
    t: 's',
    v: display,
    f: `=HYPERLINK("${escapeExcelFormulaString(target)}","${escapeExcelFormulaString(display)}")`,
    l: { Target: target, Tooltip: `Open ${display}` },
  };
  stylePayPreviewHyperlink(XLSX, worksheet, row, col);
}

function summaryColumnValue(
  column: PayPreviewSummaryColumnKey,
  row: PayPreviewExportEmployee,
  month: string,
  pendingCompensation: boolean
): string | number {
  const summary = summarizeEmployeeRow(row);
  switch (column) {
    case 'employeeCode':
      return row.employeeCode;
    case 'role':
      return row.workforceRoleTypeShort ?? '';
    case 'visaHolding':
      return row.visaHoldingLabel ?? '';
    case 'visaSponsor':
      return row.visaSponsorName ?? '';
    case 'payType':
      return pendingCompensation ? (row.skipReason ?? '') : (row.payTypeName ?? '');
    case 'attendance':
      return attendanceOutOfLabel(row, month);
    case 'health':
      if (pendingCompensation) return 'Pending';
      return row.healthCheck ? (row.healthCheck.ok ? 'OK' : 'Check') : '';
    case 'totalHours':
      return pendingCompensation ? '' : formatHours(summary.totalHours);
    case 'totalOt':
      return pendingCompensation ? '' : formatHours(summary.totalOt);
    case 'basicSalary':
      return pendingCompensation ? '' : summary.basicSalary;
    case 'otSalary':
      return pendingCompensation ? '' : summary.otSalary;
    case 'allowance':
      return pendingCompensation ? '' : summary.allowance;
    case 'deduction':
      return pendingCompensation ? '' : summary.deduction;
    case 'wps':
      return pendingCompensation ? '' : (row.wpsTransferAmount ?? '');
    case 'gross':
      return pendingCompensation ? '' : row.gross;
  }
}

function summaryNumberCols(selectedColumns: PayPreviewSummaryColumnKey[]) {
  return selectedColumns
    .map((column, index) => (MONEY_SUMMARY_COLUMNS.has(column) ? index + 1 : -1))
    .filter((index) => index >= 0);
}

function summaryHealthCol(selectedColumns: PayPreviewSummaryColumnKey[]) {
  const index = selectedColumns.indexOf('health');
  return index >= 0 ? index + 1 : undefined;
}

function estimateColWidths(rows: Array<Array<string | number | boolean | null>>, min = 10, max = 28) {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      const length = String(cell ?? '').length + 2;
      widths[index] = Math.min(max, Math.max(widths[index] ?? min, length, min));
    });
  }
  return widths.length > 0 ? widths : [16, 16, 14, 14];
}

function buildSummarySheet(
  payload: PayPreviewExportPayload,
  options: PayPreviewExportOptions
): PayPreviewSheetModel {
  const included = payload.employees.filter((row) => !row.skipped);
  const pendingCompensation = payload.employees.filter((row) => isPayPreviewPendingCompensationRow(row));
  const skipped = payload.employees.filter(
    (row) => row.skipped && !isPayPreviewPendingCompensationRow(row)
  );
  const selectedColumns = options.summaryColumns;
  const header = ['Employee', ...selectedColumns.map((key) => SUMMARY_COLUMN_LABELS[key])];
  const numberCols = summaryNumberCols(selectedColumns);
  const healthCol = summaryHealthCol(selectedColumns);

  const rows: Array<Array<string | number | boolean | null>> = [];
  const hints: PayPreviewRowStyleHint[] = [];

  rows.push(['Payroll preview', payload.month]);
  hints.push({ kind: 'title', cols: 2 });
  rows.push(['Total gross (AED)', payload.totalGross]);
  hints.push({ kind: 'meta', moneyCols: [1] });
  rows.push(['Employees included', included.length]);
  hints.push({ kind: 'meta' });
  rows.push([]);
  hints.push({ kind: 'blank' });
  rows.push(header);
  hints.push({ kind: 'tableHeader', cols: header.length });

  let dataIndex = 0;
  for (const row of included) {
    rows.push([
      resolveDisplayFullName(row),
      ...selectedColumns.map((column) => summaryColumnValue(column, row, payload.month, false)),
    ]);
    hints.push({
      kind: 'data',
      cols: header.length,
      variant: dataIndex % 2 === 1 ? 'alt' : 'normal',
      numberCols,
      healthCol,
    });
    dataIndex += 1;
  }

  for (const row of pendingCompensation) {
    rows.push([
      resolveDisplayFullName(row),
      ...selectedColumns.map((column) => summaryColumnValue(column, row, payload.month, true)),
    ]);
    hints.push({
      kind: 'data',
      cols: header.length,
      variant: 'pending',
      numberCols,
      healthCol,
    });
  }

  if (hasPayPreviewExportSection(options, 'skippedEmployees') && skipped.length > 0) {
    rows.push([]);
    hints.push({ kind: 'blank' });
    rows.push(['Skipped employees']);
    hints.push({ kind: 'section', cols: 3 });
    rows.push(['Employee', 'Employee code', 'Skip reason']);
    hints.push({ kind: 'tableHeader', cols: 3 });
    for (const [index, row] of skipped.entries()) {
      rows.push([resolveDisplayFullName(row), row.employeeCode, row.skipReason ?? '']);
      hints.push({
        kind: 'data',
        cols: 3,
        variant: index % 2 === 1 ? 'alt' : 'normal',
      });
    }
  }

  return {
    name: SUMMARY_SHEET_NAME,
    rows,
    hints,
    freezeRow: SUMMARY_META_ROW_COUNT + 1,
    colWidths: estimateColWidths(rows),
  };
}

function dayColumnValue(
  column: PayPreviewDayColumnKey,
  day: PayPreviewExportDayDetail
): string | number | null {
  switch (column) {
    case 'totalHours':
      return day.totalHours;
    case 'basicHours':
      return day.basicHours;
    case 'otHours':
      return day.otHours;
    case 'basicSalary':
      return day.basicHourSalary;
    case 'otRate':
      return day.otHourRate;
    case 'otSalary':
      return day.otHourSalary;
    case 'allowance':
      return day.componentEarning ?? Math.max(0, day.allowance);
    case 'deduction':
      return day.componentDeduction ?? 0;
    case 'total':
      return day.totalSalary;
    case 'status':
      return day.status;
  }
}

function dayTotalValue(
  column: PayPreviewDayColumnKey,
  dayTotals: ReturnType<typeof summarizeDayComponentTotals>
): string | number | null {
  switch (column) {
    case 'basicSalary':
      return dayTotals.basicSalary;
    case 'otSalary':
      return dayTotals.otSalary;
    case 'allowance':
      return dayTotals.earnings;
    case 'deduction':
      return dayTotals.deductions;
    case 'total':
      return dayTotals.totalSalary;
    default:
      return null;
  }
}

function buildEmployeeDetailSheet(
  row: PayPreviewExportEmployee,
  month: string,
  options: PayPreviewExportOptions,
  sheetName: string
): PayPreviewSheetModel {
  const summary = summarizeEmployeeRow(row);
  const dayRows = row.dayDetails ?? [];
  const dayTotals = summarizeDayComponentTotals(dayRows);
  const componentSplit = resolveSalaryComponentBreakdown(row, dayRows);
  const breakdownEntries = visibleBreakdownEntries(row.breakdown).filter(([key]) =>
    isBreakdownKeySelected(options, key)
  );
  const preferred = row.employeePreferredName?.trim() || '';
  const includeBackLink = hasPayPreviewExportSection(options, 'employeeSheets');

  const rows: Array<Array<string | number | boolean | null>> = [];
  const hints: PayPreviewRowStyleHint[] = [];

  rows.push(
    includeBackLink
      ? ['Payroll breakdown', resolveDisplayFullName(row), 'Summary']
      : ['Payroll breakdown', resolveDisplayFullName(row)]
  );
  hints.push({ kind: 'title', cols: includeBackLink ? 3 : 2 });

  rows.push([]);
  hints.push({ kind: 'blank' });

  const pushProfile = (field: PayPreviewDetailFieldKey, label: string, value: string | number | null) => {
    if (!hasPayPreviewDetailField(options, field)) return;
    rows.push([label, value]);
    hints.push({ kind: 'kv', moneyCols: MONEY_DETAIL_FIELDS.has(field) ? [1] : undefined });
  };

  pushProfile('fullName', 'Full name', resolveDisplayFullName(row));
  pushProfile('preferredName', 'Preferred name', preferred || null);
  pushProfile('employeeCode', 'Employee code', row.employeeCode);
  pushProfile('role', 'Workforce role', row.workforceRoleTypeShort ?? null);
  pushProfile('visaHolding', 'Visa holding', row.visaHoldingLabel ?? null);
  pushProfile('visaSponsor', 'Visa sponsor', row.visaSponsorName ?? null);
  pushProfile('payType', 'Pay type', row.payTypeName ?? null);
  pushProfile('month', 'Month', month);
  pushProfile('attendance', 'Attendance (active / saved)', attendanceOutOfLabel(row, month));
  pushProfile('wps', 'WPS transfer (AED)', row.wpsTransferAmount ?? null);
  pushProfile('gross', 'Gross (AED)', row.gross);

  const totalsHeader: string[] = [];
  const totalsValues: Array<string | number> = [];
  const totalsNumberCols: number[] = [];
  const pushTotal = (field: PayPreviewDetailFieldKey, label: string, value: string | number) => {
    if (!hasPayPreviewDetailField(options, field)) return;
    if (MONEY_DETAIL_FIELDS.has(field)) totalsNumberCols.push(totalsHeader.length);
    totalsHeader.push(label);
    totalsValues.push(value);
  };
  pushTotal('totalHours', 'Total hours', formatHours(summary.totalHours));
  pushTotal('totalOt', 'Total OT', formatHours(summary.totalOt));
  pushTotal('basicSalary', 'Basic salary', summary.basicSalary);
  pushTotal('otSalary', 'OT salary', summary.otSalary);
  pushTotal('allowance', 'Allowance', summary.allowance);
  pushTotal('deduction', 'Deduction', summary.deduction);
  if (totalsHeader.length > 0) {
    rows.push([]);
    hints.push({ kind: 'blank' });
    rows.push(totalsHeader);
    hints.push({ kind: 'totalsStripHeader', cols: totalsHeader.length });
    rows.push(totalsValues);
    hints.push({ kind: 'totalsStripValues', cols: totalsValues.length, numberCols: totalsNumberCols });
  }

  const salaryRows: Array<Array<string | number>> = [];
  if (hasPayPreviewSalaryComponentField(options, 'fixedEarnings') && componentSplit.fixedEarnings > 0) {
    salaryRows.push(['Fixed earnings', componentSplit.fixedEarnings]);
  }
  if (hasPayPreviewSalaryComponentField(options, 'fixedDeductions') && componentSplit.fixedDeductions > 0) {
    salaryRows.push(['Fixed deductions', componentSplit.fixedDeductions]);
  }
  if (
    hasPayPreviewSalaryComponentField(options, 'attendanceEarnings') &&
    componentSplit.attendanceEarnings > 0
  ) {
    salaryRows.push(['Attendance earnings', componentSplit.attendanceEarnings]);
  }
  if (
    hasPayPreviewSalaryComponentField(options, 'attendanceDeductions') &&
    componentSplit.attendanceDeductions > 0
  ) {
    salaryRows.push(['Attendance deductions', componentSplit.attendanceDeductions]);
  }
  if (
    hasPayPreviewSalaryComponentField(options, 'totalEarnings') &&
    (componentSplit.totalEarnings > 0 || salaryRows.length > 0)
  ) {
    salaryRows.push(['Total earnings', componentSplit.totalEarnings]);
  }
  if (
    hasPayPreviewSalaryComponentField(options, 'totalDeductions') &&
    (componentSplit.totalDeductions > 0 || salaryRows.length > 0)
  ) {
    salaryRows.push(['Total deductions', componentSplit.totalDeductions]);
  }
  if (salaryRows.length > 0) {
    rows.push([]);
    hints.push({ kind: 'blank' });
    rows.push(['Salary components']);
    hints.push({ kind: 'section', cols: 2 });
    for (const salaryRow of salaryRows) {
      rows.push(salaryRow);
      hints.push({ kind: 'kv', moneyCols: [1] });
    }
  }

  if (breakdownEntries.length > 0) {
    rows.push([]);
    hints.push({ kind: 'blank' });
    rows.push(['Pay calculation breakdown']);
    hints.push({ kind: 'section', cols: 2 });
    for (const [key, value] of breakdownEntries) {
      rows.push([breakdownLabel(key), formatBreakdownValue(key, value)]);
      hints.push({ kind: 'kv', moneyCols: isMoneyBreakdownKey(key) ? [1] : undefined });
    }
  }

  if (row.healthCheck && options.healthFields.length > 0) {
    const health = row.healthCheck;
    const healthRows: Array<{ row: Array<string | number | null>; money?: boolean }> = [];
    if (hasPayPreviewHealthField(options, 'status')) {
      healthRows.push({ row: ['Status', health.ok ? 'OK' : 'Check'] });
    }
    if (hasPayPreviewHealthField(options, 'basicPaidCap')) {
      healthRows.push({
        row: ['Basic paid / cap', `${formatPayMoney(health.basicPaid)} / ${formatPayMoney(health.basicCap)}`],
      });
    }
    if (hasPayPreviewHealthField(options, 'allowancePaidCap')) {
      healthRows.push({
        row: [
          'Allowance paid / cap',
          `${formatPayMoney(health.allowancePaid)} / ${formatPayMoney(health.allowanceCap)}`,
        ],
      });
    }
    if (hasPayPreviewHealthField(options, 'deductionPaidCap')) {
      healthRows.push({
        row: [
          'Deduction paid / cap',
          `${formatPayMoney(health.componentDeductionsPaid)} / ${formatPayMoney(health.componentDeductionsCap)}`,
        ],
      });
    }
    if (hasPayPreviewHealthField(options, 'issues') && !health.ok) {
      healthRows.push({ row: ['Issues', health.issues.join('; ')] });
    }
    if (healthRows.length > 0) {
      rows.push([]);
      hints.push({ kind: 'blank' });
      rows.push(['Health check']);
      hints.push({ kind: 'section', cols: 2 });
      for (const entry of healthRows) {
        rows.push(entry.row);
        hints.push({ kind: 'kv' });
      }
    }
  }

  if (hasPayPreviewExportSection(options, 'dailyBreakdown')) {
    const dayColumns = options.dayColumns;
    const dayNumberCols = dayColumns
      .map((column, index) => (MONEY_DAY_COLUMNS.has(column) ? index + 1 : -1))
      .filter((index) => index >= 0);
    rows.push([]);
    hints.push({ kind: 'blank' });
    rows.push(['Daily breakdown']);
    hints.push({ kind: 'section', cols: Math.max(2, dayColumns.length + 1) });
    rows.push(['Date', ...dayColumns.map((key) => DAY_COLUMN_LABELS[key])]);
    hints.push({ kind: 'tableHeader', cols: dayColumns.length + 1 });

    if (dayRows.length === 0) {
      rows.push(['No saved attendance rows for this month.']);
      hints.push({ kind: 'note' });
    } else {
      for (const [index, day] of dayRows.entries()) {
        rows.push([day.date, ...dayColumns.map((column) => dayColumnValue(column, day))]);
        hints.push({
          kind: 'data',
          cols: dayColumns.length + 1,
          variant: index % 2 === 1 ? 'alt' : 'normal',
          numberCols: dayNumberCols,
        });
      }
      rows.push(['Day totals', ...dayColumns.map((column) => dayTotalValue(column, dayTotals))]);
      hints.push({
        kind: 'totals',
        cols: dayColumns.length + 1,
        numberCols: dayNumberCols,
      });
      if (summary.allowance > dayTotals.earnings || summary.deduction > dayTotals.deductions) {
        rows.push([
          `Month allowance (${formatPayMoney(summary.allowance)}) and deduction (${formatPayMoney(summary.deduction)}) include fixed monthly salary components not listed per day.`,
        ]);
        hints.push({ kind: 'note' });
      }
    }
  }

  return {
    name: sheetName,
    rows,
    hints,
    freezeRow: 1,
    colWidths: estimateColWidths(rows, 12, 32),
  };
}

function preparePayPreviewExportPayload(payload: PayPreviewExportPayload): PayPreviewExportPayload {
  const employees = payload.employees.filter((row) => !shouldOmitInactiveEmployeeFromPayExport(row));
  const totalGross = employees
    .filter((row) => !row.skipped)
    .reduce((sum, row) => sum + (Number.isFinite(row.gross) ? row.gross : 0), 0);
  return {
    ...payload,
    employees,
    totalGross: Math.round(totalGross * 100) / 100,
  };
}

export function buildPayPreviewWorkbookSheets(
  payload: PayPreviewExportPayload,
  optionsInput?: Partial<PayPreviewExportOptions> | null
) {
  const models = buildPayPreviewWorkbookModels(payload, optionsInput);
  return models.map((model) => ({ name: model.name, rows: model.rows }));
}

export function buildPayPreviewWorkbookModels(
  payload: PayPreviewExportPayload,
  optionsInput?: Partial<PayPreviewExportOptions> | null
): PayPreviewSheetModel[] {
  const options = normalizePayPreviewExportOptions(optionsInput);
  const exportPayload = preparePayPreviewExportPayload(payload);
  const usedNames = new Set<string>();
  const summaryName = sanitizeSheetName(SUMMARY_SHEET_NAME, usedNames);
  const summary = buildSummarySheet(exportPayload, options);
  summary.name = summaryName;

  const sheets: PayPreviewSheetModel[] = [summary];

  if (hasPayPreviewExportSection(options, 'employeeSheets')) {
    for (const employee of exportPayload.employees.filter((row) => !row.skipped)) {
      const sheetName = sanitizeSheetName(resolveDisplayFullName(employee), usedNames);
      sheets.push(buildEmployeeDetailSheet(employee, exportPayload.month, options, sheetName));
    }
  }

  return sheets;
}

export function buildPayPreviewWorkbook(
  payload: PayPreviewExportPayload,
  optionsInput?: Partial<PayPreviewExportOptions> | null
) {
  const options = normalizePayPreviewExportOptions(optionsInput);
  const models = buildPayPreviewWorkbookModels(payload, options);
  const workbook = XLSX.utils.book_new();
  const exportPayload = preparePayPreviewExportPayload(payload);
  const included = exportPayload.employees.filter((row) => !row.skipped);
  const includeEmployeeSheets = hasPayPreviewExportSection(options, 'employeeSheets');

  for (const model of models) {
    const worksheet = XLSX.utils.aoa_to_sheet(model.rows);
    applyPayPreviewWorksheetStyles(XLSX, worksheet, model);
    XLSX.utils.book_append_sheet(workbook, worksheet, model.name);
  }

  if (includeEmployeeSheets) {
    const summarySheet = workbook.Sheets[models[0]?.name ?? SUMMARY_SHEET_NAME];
    if (summarySheet) {
      for (let index = 0; index < included.length; index += 1) {
        const employeeSheet = models[index + 1];
        if (!employeeSheet) continue;
        setWorksheetHyperlink(
          summarySheet,
          SUMMARY_META_ROW_COUNT + 1 + index,
          0,
          resolveDisplayFullName(included[index]!),
          employeeSheet.name
        );
      }
    }

    for (let index = 0; index < included.length; index += 1) {
      const employeeSheet = models[index + 1];
      if (!employeeSheet) continue;
      const worksheet = workbook.Sheets[employeeSheet.name];
      if (!worksheet) continue;
      setWorksheetHyperlink(worksheet, 0, 2, 'Summary', SUMMARY_SHEET_NAME);
    }
  }

  return workbook;
}

export function downloadPayPreviewXlsx(
  payload: PayPreviewExportPayload,
  optionsInput?: Partial<PayPreviewExportOptions> | null
) {
  XLSX.writeFile(
    buildPayPreviewWorkbook(payload, optionsInput ?? DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS),
    `payroll-preview-${payload.month}.xlsx`,
    { cellStyles: true }
  );
}
