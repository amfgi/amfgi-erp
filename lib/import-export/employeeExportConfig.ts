import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';
import type { HrEmployeeExportRecord } from '@/store/api/endpoints/hr';

export type EmployeeExportColumnGroup =
  | 'identity'
  | 'contact'
  | 'employment'
  | 'workforce'
  | 'compensation';

export type EmployeeExportColumnDef = {
  key: string;
  label: string;
  group: EmployeeExportColumnGroup;
  exportOnly?: boolean;
};

export const EMPLOYEE_EXPORT_COLUMN_GROUPS: Array<{ id: EmployeeExportColumnGroup; label: string }> = [
  { id: 'identity', label: 'Identity' },
  { id: 'contact', label: 'Contact' },
  { id: 'employment', label: 'Employment' },
  { id: 'workforce', label: 'Workforce' },
  { id: 'compensation', label: 'Compensation (report only)' },
];

export const EMPLOYEE_EXPORT_COLUMNS: EmployeeExportColumnDef[] = [
  { key: 'ID', label: 'ID', group: 'identity' },
  { key: 'Employee Code', label: 'Employee Code', group: 'identity' },
  { key: 'Full Name', label: 'Full Name', group: 'identity' },
  { key: 'Preferred Name', label: 'Preferred Name', group: 'identity' },
  { key: 'Email', label: 'Email', group: 'contact' },
  { key: 'Phone', label: 'Phone', group: 'contact' },
  { key: 'Nationality', label: 'Nationality', group: 'contact' },
  { key: 'Date of Birth', label: 'Date of Birth', group: 'contact' },
  { key: 'Gender', label: 'Gender', group: 'contact' },
  { key: 'Emergency Contact Name', label: 'Emergency Contact Name', group: 'contact' },
  { key: 'Emergency Contact Phone', label: 'Emergency Contact Phone', group: 'contact' },
  { key: 'Blood Group', label: 'Blood Group', group: 'contact' },
  { key: 'Designation', label: 'Designation', group: 'employment' },
  { key: 'Department', label: 'Department', group: 'employment' },
  { key: 'Employment Type', label: 'Employment Type', group: 'employment' },
  { key: 'Signature Group', label: 'Signature Group', group: 'employment' },
  { key: 'Hire Date', label: 'Hire Date', group: 'employment' },
  { key: 'Termination Date', label: 'Termination Date', group: 'employment' },
  { key: 'Status', label: 'Status', group: 'employment' },
  { key: 'Portal Enabled', label: 'Portal Enabled', group: 'employment' },
  { key: 'Admin Notes', label: 'Admin Notes', group: 'employment' },
  { key: 'Employee Type', label: 'Employee Type', group: 'workforce' },
  { key: 'Workforce Role Short', label: 'Workforce Role Short', group: 'workforce' },
  { key: 'Visa Holding', label: 'Visa Holding', group: 'workforce' },
  { key: 'Expertises', label: 'Expertises', group: 'workforce' },
  { key: 'Compensation Type', label: 'Compensation Type', group: 'compensation', exportOnly: true },
  { key: 'Compensation Basic', label: 'Compensation Basic', group: 'compensation', exportOnly: true },
  { key: 'Compensation Per Day', label: 'Compensation Per Day', group: 'compensation', exportOnly: true },
  { key: 'Compensation Components', label: 'Compensation Components', group: 'compensation', exportOnly: true },
  { key: 'Compensation Total', label: 'Compensation Total', group: 'compensation', exportOnly: true },
  {
    key: 'Compensation Effective From',
    label: 'Compensation Effective From',
    group: 'compensation',
    exportOnly: true,
  },
];

export const DEFAULT_EMPLOYEE_EXPORT_COLUMN_KEYS = EMPLOYEE_EXPORT_COLUMNS.map((c) => c.key);

export type EmployeeExportSortKey =
  | 'fullName'
  | 'employeeCode'
  | 'hireDate'
  | 'department'
  | 'designation'
  | 'status'
  | 'employeeType';

export const EMPLOYEE_EXPORT_SORT_OPTIONS: Array<{ value: EmployeeExportSortKey; label: string }> = [
  { value: 'fullName', label: 'Full name' },
  { value: 'employeeCode', label: 'Employee code' },
  { value: 'hireDate', label: 'Hire date' },
  { value: 'department', label: 'Department' },
  { value: 'designation', label: 'Designation' },
  { value: 'status', label: 'Status' },
  { value: 'employeeType', label: 'Employee type' },
];

function sortValue(employee: HrEmployeeExportRecord, sortBy: EmployeeExportSortKey): string {
  switch (sortBy) {
    case 'fullName':
      return employee.fullName ?? '';
    case 'employeeCode':
      return employee.employeeCode ?? '';
    case 'hireDate': {
      const d = employee.hireDate;
      if (!d) return '';
      const parsed = typeof d === 'string' ? new Date(d) : d;
      return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
    }
    case 'department':
      return employee.department ?? '';
    case 'designation':
      return employee.designation ?? '';
    case 'status':
      return employee.status ?? '';
    case 'employeeType':
      return parseWorkforceProfile(employee.profileExtension).employeeType ?? '';
    default:
      return '';
  }
}

export function sortEmployeeExportRecords(
  rows: HrEmployeeExportRecord[],
  sortBy: EmployeeExportSortKey,
  direction: 'asc' | 'desc'
): HrEmployeeExportRecord[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const cmp = sortValue(a, sortBy).localeCompare(sortValue(b, sortBy), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (cmp !== 0) return cmp * factor;
    return a.fullName.localeCompare(b.fullName) * factor;
  });
}

export function pickExportRowColumns(
  row: Record<string, string | number | boolean>,
  columnKeys: string[]
): Record<string, string | number | boolean> {
  const picked: Record<string, string | number | boolean> = {};
  for (const key of columnKeys) {
    if (key in row) picked[key] = row[key];
  }
  return picked;
}

export function columnsByGroup(group: EmployeeExportColumnGroup) {
  return EMPLOYEE_EXPORT_COLUMNS.filter((c) => c.group === group);
}
