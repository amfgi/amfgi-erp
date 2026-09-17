export type PayPreviewSummaryColumnKey =
  | 'employeeCode'
  | 'role'
  | 'visaHolding'
  | 'visaSponsor'
  | 'payType'
  | 'attendance'
  | 'health'
  | 'totalHours'
  | 'totalOt'
  | 'basicSalary'
  | 'otSalary'
  | 'allowance'
  | 'deduction'
  | 'wps'
  | 'gross';

export type PayPreviewDetailFieldKey =
  | 'fullName'
  | 'preferredName'
  | 'employeeCode'
  | 'role'
  | 'visaHolding'
  | 'visaSponsor'
  | 'payType'
  | 'month'
  | 'attendance'
  | 'wps'
  | 'gross'
  | 'totalHours'
  | 'totalOt'
  | 'basicSalary'
  | 'otSalary'
  | 'allowance'
  | 'deduction';

export type PayPreviewSalaryComponentFieldKey =
  | 'fixedEarnings'
  | 'fixedDeductions'
  | 'attendanceEarnings'
  | 'attendanceDeductions'
  | 'totalEarnings'
  | 'totalDeductions';

export type PayPreviewBreakdownFieldKey =
  | 'monthlyBasic'
  | 'deductions'
  | 'deductDays'
  | 'deductDaysInMonth'
  | 'earnedDays'
  | 'unpaidAbsentDays'
  | 'dailyRate'
  | 'dailyWageTotal'
  | 'hourlyTotal'
  | 'outsideCapOt'
  | 'holidayWorkedOt'
  | 'excludedWeekdayOt'
  | 'other';

export type PayPreviewHealthFieldKey =
  | 'status'
  | 'basicPaidCap'
  | 'allowancePaidCap'
  | 'deductionPaidCap'
  | 'issues';

export type PayPreviewExportSectionKey =
  | 'employeeSheets'
  | 'dailyBreakdown'
  | 'skippedEmployees';

export type PayPreviewDayColumnKey =
  | 'totalHours'
  | 'basicHours'
  | 'otHours'
  | 'basicSalary'
  | 'otRate'
  | 'otSalary'
  | 'allowance'
  | 'deduction'
  | 'total'
  | 'status';

export const PAY_PREVIEW_SUMMARY_COLUMNS: Array<{
  key: PayPreviewSummaryColumnKey;
  label: string;
  group: 'identity' | 'pay';
}> = [
  { key: 'employeeCode', label: 'Employee code', group: 'identity' },
  { key: 'role', label: 'Role', group: 'identity' },
  { key: 'visaHolding', label: 'Visa holding', group: 'identity' },
  { key: 'visaSponsor', label: 'Visa sponsor', group: 'identity' },
  { key: 'payType', label: 'Pay type', group: 'identity' },
  { key: 'attendance', label: 'Attendance (active / saved)', group: 'identity' },
  { key: 'health', label: 'Health', group: 'identity' },
  { key: 'totalHours', label: 'Total hours', group: 'pay' },
  { key: 'totalOt', label: 'Total OT', group: 'pay' },
  { key: 'basicSalary', label: 'Basic salary', group: 'pay' },
  { key: 'otSalary', label: 'OT salary', group: 'pay' },
  { key: 'allowance', label: 'Allowance', group: 'pay' },
  { key: 'deduction', label: 'Deduction', group: 'pay' },
  { key: 'wps', label: 'WPS (AED)', group: 'pay' },
  { key: 'gross', label: 'Gross (AED)', group: 'pay' },
];

export const PAY_PREVIEW_DETAIL_FIELDS: Array<{
  key: PayPreviewDetailFieldKey;
  label: string;
  group: 'profile' | 'totals';
}> = [
  { key: 'fullName', label: 'Full name', group: 'profile' },
  { key: 'preferredName', label: 'Preferred name', group: 'profile' },
  { key: 'employeeCode', label: 'Employee code', group: 'profile' },
  { key: 'role', label: 'Workforce role', group: 'profile' },
  { key: 'visaHolding', label: 'Visa holding', group: 'profile' },
  { key: 'visaSponsor', label: 'Visa sponsor', group: 'profile' },
  { key: 'payType', label: 'Pay type', group: 'profile' },
  { key: 'month', label: 'Month', group: 'profile' },
  { key: 'attendance', label: 'Attendance (active / saved)', group: 'profile' },
  { key: 'wps', label: 'WPS transfer (AED)', group: 'profile' },
  { key: 'gross', label: 'Gross (AED)', group: 'profile' },
  { key: 'totalHours', label: 'Total hours', group: 'totals' },
  { key: 'totalOt', label: 'Total OT', group: 'totals' },
  { key: 'basicSalary', label: 'Basic salary', group: 'totals' },
  { key: 'otSalary', label: 'OT salary', group: 'totals' },
  { key: 'allowance', label: 'Allowance', group: 'totals' },
  { key: 'deduction', label: 'Deduction', group: 'totals' },
];

export const PAY_PREVIEW_SALARY_COMPONENT_FIELDS: Array<{
  key: PayPreviewSalaryComponentFieldKey;
  label: string;
}> = [
  { key: 'fixedEarnings', label: 'Fixed earnings' },
  { key: 'fixedDeductions', label: 'Fixed deductions' },
  { key: 'attendanceEarnings', label: 'Attendance earnings' },
  { key: 'attendanceDeductions', label: 'Attendance deductions' },
  { key: 'totalEarnings', label: 'Total earnings' },
  { key: 'totalDeductions', label: 'Total deductions' },
];

export const PAY_PREVIEW_BREAKDOWN_FIELDS: Array<{
  key: PayPreviewBreakdownFieldKey;
  label: string;
}> = [
  { key: 'monthlyBasic', label: 'Monthly basic' },
  { key: 'deductions', label: 'Absence deductions' },
  { key: 'deductDays', label: 'Absent days deducted' },
  { key: 'deductDaysInMonth', label: 'Deduct days in month' },
  { key: 'earnedDays', label: 'Earned days' },
  { key: 'unpaidAbsentDays', label: 'Unpaid absent days' },
  { key: 'dailyRate', label: 'Daily rate' },
  { key: 'dailyWageTotal', label: 'Daily wage total' },
  { key: 'hourlyTotal', label: 'Hourly total' },
  { key: 'outsideCapOt', label: 'Outside-cap OT' },
  { key: 'holidayWorkedOt', label: 'Holiday worked OT' },
  { key: 'excludedWeekdayOt', label: 'Weekly off OT' },
  { key: 'other', label: 'Other breakdown lines' },
];

export const PAY_PREVIEW_HEALTH_FIELDS: Array<{
  key: PayPreviewHealthFieldKey;
  label: string;
}> = [
  { key: 'status', label: 'Health status' },
  { key: 'basicPaidCap', label: 'Basic paid / cap' },
  { key: 'allowancePaidCap', label: 'Allowance paid / cap' },
  { key: 'deductionPaidCap', label: 'Deduction paid / cap' },
  { key: 'issues', label: 'Issues' },
];

export const PAY_PREVIEW_EXPORT_SECTIONS: Array<{
  key: PayPreviewExportSectionKey;
  label: string;
  description: string;
}> = [
  {
    key: 'employeeSheets',
    label: 'One sheet per employee',
    description: 'Adds a detail tab for each included employee with a link from Summary.',
  },
  {
    key: 'dailyBreakdown',
    label: 'Daily breakdown table',
    description: 'Per-day attendance and pay rows on employee sheets.',
  },
  {
    key: 'skippedEmployees',
    label: 'Skipped employees list',
    description: 'List employees excluded from the preview on the Summary sheet.',
  },
];

export const PAY_PREVIEW_DAY_COLUMNS: Array<{
  key: PayPreviewDayColumnKey;
  label: string;
}> = [
  { key: 'totalHours', label: 'Total h' },
  { key: 'basicHours', label: 'Basic h' },
  { key: 'otHours', label: 'OT h' },
  { key: 'basicSalary', label: 'Basic salary' },
  { key: 'otRate', label: 'OT rate' },
  { key: 'otSalary', label: 'OT salary' },
  { key: 'allowance', label: 'Allowance' },
  { key: 'deduction', label: 'Deduction' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Status' },
];

export type PayPreviewExportOptions = {
  summaryColumns: PayPreviewSummaryColumnKey[];
  sections: PayPreviewExportSectionKey[];
  detailFields: PayPreviewDetailFieldKey[];
  salaryComponentFields: PayPreviewSalaryComponentFieldKey[];
  breakdownFields: PayPreviewBreakdownFieldKey[];
  healthFields: PayPreviewHealthFieldKey[];
  dayColumns: PayPreviewDayColumnKey[];
};

export const DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS: PayPreviewExportOptions = {
  summaryColumns: PAY_PREVIEW_SUMMARY_COLUMNS.map((c) => c.key),
  sections: PAY_PREVIEW_EXPORT_SECTIONS.map((s) => s.key),
  detailFields: PAY_PREVIEW_DETAIL_FIELDS.map((f) => f.key),
  salaryComponentFields: PAY_PREVIEW_SALARY_COMPONENT_FIELDS.map((f) => f.key),
  breakdownFields: PAY_PREVIEW_BREAKDOWN_FIELDS.map((f) => f.key),
  healthFields: PAY_PREVIEW_HEALTH_FIELDS.map((f) => f.key),
  dayColumns: PAY_PREVIEW_DAY_COLUMNS.map((c) => c.key),
};

const KNOWN_BREAKDOWN_KEYS = new Set(
  PAY_PREVIEW_BREAKDOWN_FIELDS.filter((f) => f.key !== 'other').map((f) => f.key)
);

export function normalizePayPreviewExportOptions(
  options?: Partial<PayPreviewExportOptions> | null
): PayPreviewExportOptions {
  const summarySet = new Set(options?.summaryColumns ?? DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.summaryColumns);
  const sectionSet = new Set(options?.sections ?? DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.sections);
  const detailSet = new Set(options?.detailFields ?? DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.detailFields);
  const salarySet = new Set(
    options?.salaryComponentFields ?? DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.salaryComponentFields
  );
  const breakdownSet = new Set(
    options?.breakdownFields ?? DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.breakdownFields
  );
  const healthSet = new Set(options?.healthFields ?? DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.healthFields);
  const daySet = new Set(options?.dayColumns ?? DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.dayColumns);

  return {
    summaryColumns: PAY_PREVIEW_SUMMARY_COLUMNS.map((c) => c.key).filter((key) => summarySet.has(key)),
    sections: PAY_PREVIEW_EXPORT_SECTIONS.map((s) => s.key).filter((key) => sectionSet.has(key)),
    detailFields: PAY_PREVIEW_DETAIL_FIELDS.map((f) => f.key).filter((key) => detailSet.has(key)),
    salaryComponentFields: PAY_PREVIEW_SALARY_COMPONENT_FIELDS.map((f) => f.key).filter((key) =>
      salarySet.has(key)
    ),
    breakdownFields: PAY_PREVIEW_BREAKDOWN_FIELDS.map((f) => f.key).filter((key) => breakdownSet.has(key)),
    healthFields: PAY_PREVIEW_HEALTH_FIELDS.map((f) => f.key).filter((key) => healthSet.has(key)),
    dayColumns: PAY_PREVIEW_DAY_COLUMNS.map((c) => c.key).filter((key) => daySet.has(key)),
  };
}

export function hasPayPreviewExportSection(
  options: PayPreviewExportOptions,
  section: PayPreviewExportSectionKey
) {
  return options.sections.includes(section);
}

export function hasPayPreviewSummaryColumn(
  options: PayPreviewExportOptions,
  column: PayPreviewSummaryColumnKey
) {
  return options.summaryColumns.includes(column);
}

export function hasPayPreviewDetailField(options: PayPreviewExportOptions, field: PayPreviewDetailFieldKey) {
  return options.detailFields.includes(field);
}

export function hasPayPreviewSalaryComponentField(
  options: PayPreviewExportOptions,
  field: PayPreviewSalaryComponentFieldKey
) {
  return options.salaryComponentFields.includes(field);
}

export function hasPayPreviewBreakdownField(
  options: PayPreviewExportOptions,
  field: PayPreviewBreakdownFieldKey
) {
  return options.breakdownFields.includes(field);
}

export function hasPayPreviewHealthField(options: PayPreviewExportOptions, field: PayPreviewHealthFieldKey) {
  return options.healthFields.includes(field);
}

export function hasPayPreviewDayColumn(options: PayPreviewExportOptions, column: PayPreviewDayColumnKey) {
  return options.dayColumns.includes(column);
}

export function isBreakdownKeySelected(options: PayPreviewExportOptions, key: string) {
  if (KNOWN_BREAKDOWN_KEYS.has(key as PayPreviewBreakdownFieldKey)) {
    return hasPayPreviewBreakdownField(options, key as PayPreviewBreakdownFieldKey);
  }
  return hasPayPreviewBreakdownField(options, 'other');
}

export function countPayPreviewExportSelections(options: PayPreviewExportOptions) {
  return (
    options.summaryColumns.length +
    options.sections.length +
    options.detailFields.length +
    options.salaryComponentFields.length +
    options.breakdownFields.length +
    options.healthFields.length +
    options.dayColumns.length
  );
}
