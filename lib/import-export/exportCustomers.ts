import { downloadWorkbook } from '@/lib/import-export/xlsx';
import { customerToExportRow } from '@/lib/import-export/customerFields';
import type { Customer } from '@/store/api/endpoints/customers';

export function exportCustomersToXlsx(customers: Customer[]) {
  const rows = customers.map(customerToExportRow);
  downloadWorkbook(`customers-export-${new Date().toISOString().slice(0, 10)}.xlsx`, [
    { name: 'Customers', rows },
  ]);
}
