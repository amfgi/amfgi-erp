import { downloadWorkbook } from '@/lib/import-export/xlsx';
import { employeeToExportRow } from '@/lib/import-export/employeeFields';
import type { HrEmployeeExportRecord } from '@/store/api/endpoints/hr';

export function exportEmployeesToXlsx(employees: HrEmployeeExportRecord[]) {
  const rows = employees.map(employeeToExportRow);
  downloadWorkbook(`employees-export-${new Date().toISOString().slice(0, 10)}.xlsx`, [
    { name: 'Employees', rows },
  ]);
}
