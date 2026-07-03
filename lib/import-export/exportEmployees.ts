import { downloadWorkbook } from '@/lib/import-export/xlsx';
import { employeeToExportRow } from '@/lib/import-export/employeeFields';
import {
  DEFAULT_EMPLOYEE_EXPORT_COLUMN_KEYS,
  pickExportRowColumns,
} from '@/lib/import-export/employeeExportConfig';
import type { HrEmployeeExportRecord } from '@/store/api/endpoints/hr';

export type EmployeeExportOptions = {
  label?: string;
  columns?: string[];
  includeInstructions?: boolean;
};

function resolveExportOptions(options?: EmployeeExportOptions | string): EmployeeExportOptions {
  if (typeof options === 'string') return { label: options };
  return options ?? {};
}

export function exportEmployeesToXlsx(
  employees: HrEmployeeExportRecord[],
  options?: EmployeeExportOptions | string
) {
  const { label = 'employees', columns = DEFAULT_EMPLOYEE_EXPORT_COLUMN_KEYS, includeInstructions = true } =
    resolveExportOptions(options);
  const rows = employees.map((employee) =>
    pickExportRowColumns(employeeToExportRow(employee), columns)
  );
  const stamp = new Date().toISOString().slice(0, 10);
  const sheets: Array<{ name: string; rows: Array<Record<string, string | number | boolean>> | string[][] }> = [];

  if (includeInstructions) {
    sheets.push({
      name: 'Instructions',
      rows: [
        ['Employee export'],
        ['Re-import using Import on the employee directory. Match updates by ID or Employee Code.'],
        ['Only columns present in your import file are updated; export → edit → import is supported.'],
        ['Signature Group must match a name from HR → Settings → Employment options.'],
        [
          'Compensation columns are report-only on export — map them to Skip Column if re-importing a spreadsheet.',
        ],
        ['Visa periods and documents are managed on each employee profile.'],
      ],
    });
  }

  sheets.push({ name: 'Employees', rows });

  downloadWorkbook(`${label}-export-${stamp}.xlsx`, sheets);
}
