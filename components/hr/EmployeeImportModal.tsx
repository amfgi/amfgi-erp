'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';

import EntityImportModal from '@/components/import-export/EntityImportModal';
import { extractImportApiErrorMessage } from '@/lib/import-export/apiErrors';
import { runChunkedBulkImport } from '@/lib/import-export/chunkedBulkImport';
import {
  EMPLOYEE_IMPORT_FIELDS,
  downloadEmployeeImportTemplate,
  employeeImportRowToPayload,
  mapEmployeeImportRow,
} from '@/lib/import-export/employeeFields';
import type { BulkImportResult } from '@/lib/import-export/types';
import type { ImportPreviewRow, MappedImportRow } from '@/lib/import-export/types';
import {
  useBulkImportEmployeesMutation,
  useGetHrEmployeesForExportQuery,
} from '@/store/api/endpoints/hr';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

function employeeRecordKey(row: MappedImportRow) {
  return String(row.employee_code ?? '')
    .trim()
    .toLowerCase();
}

export default function EmployeeImportModal({ isOpen, onClose }: Props) {
  const [bulkImport, { isLoading }] = useBulkImportEmployeesMutation();
  const {
    data: employees = [],
    isFetching,
    refetch,
  } = useGetHrEmployeesForExportQuery(undefined, {
    skip: !isOpen,
    refetchOnMountOrArgChange: true,
  });

  useEffect(() => {
    if (isOpen) void refetch();
  }, [isOpen, refetch]);

  return (
    <EntityImportModal<MappedImportRow>
      isOpen={isOpen}
      onClose={onClose}
      title="Import employees"
      fields={EMPLOYEE_IMPORT_FIELDS}
      previewLabelKey="employee_code"
      previewColumn1Label="Code"
      previewColumn2Key="full_name"
      previewColumn2Label="Full name"
      duplicateInFileLabel="employee code"
      duplicateMatchLabel="employee code"
      duplicateNote="Rows matching an existing employee ID or code are listed under Duplicates and selected for update by default. Only mapped columns with values are changed."
      onDownloadTemplate={downloadEmployeeImportTemplate}
      existingRecords={employees.map((e) => ({
        id: e.id,
        name: e.employeeCode.trim(),
      }))}
      existingRecordsLoading={isFetching}
      defaultDuplicateAction="update"
      getRecordKey={employeeRecordKey}
      isSubmitting={isLoading}
      mapRow={mapEmployeeImportRow}
      toPayload={(row: ImportPreviewRow<MappedImportRow>) => employeeImportRowToPayload(row)}
      onSubmit={async ({ newRows, updateRows }, onProgress) => {
        try {
          const result = await runChunkedBulkImport(
            { newRows, updateRows },
            (chunk) => bulkImport(chunk).unwrap(),
            { onProgress }
          );
          showImportResultToast(result);
        } catch (err: unknown) {
          toast.error(extractImportApiErrorMessage(err, 'Employee import failed'), { duration: 8000 });
          throw err;
        }
      }}
    />
  );
}

function showImportResultToast(result: BulkImportResult) {
  const warn = result.skipped > 0 ? ` (${result.skipped} skipped)` : '';
  toast.success(`Imported ${result.created} new, updated ${result.updated}${warn}`);
  if (result.warnings.length > 0 && result.warnings.length <= 3) {
    result.warnings.forEach((w) => toast(w, { icon: '⚠️' }));
  } else if (result.warnings.length > 3) {
    toast(`${result.warnings.length} rows skipped — see warnings`, { icon: '⚠️' });
  }
}
