import { downloadWorkbook } from '@/lib/import-export/xlsx';
import { supplierToExportRow } from '@/lib/import-export/supplierFields';
import type { Supplier } from '@/store/api/endpoints/suppliers';

export function exportSuppliersToXlsx(suppliers: Supplier[]) {
  const rows = suppliers.map(supplierToExportRow);
  downloadWorkbook(`suppliers-export-${new Date().toISOString().slice(0, 10)}.xlsx`, [
    { name: 'Suppliers', rows },
  ]);
}
