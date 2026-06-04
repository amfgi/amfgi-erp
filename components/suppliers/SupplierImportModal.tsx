'use client';

import toast from 'react-hot-toast';

import EntityImportModal from '@/components/import-export/EntityImportModal';
import { extractImportApiErrorMessage } from '@/lib/import-export/apiErrors';
import { runChunkedBulkImport } from '@/lib/import-export/chunkedBulkImport';
import type { ImportPreviewRow, MappedImportRow } from '@/lib/import-export/types';
import {
  SUPPLIER_IMPORT_FIELDS,
  downloadSupplierImportTemplate,
  mapSupplierImportRow,
  supplierImportRowToPayload,
} from '@/lib/import-export/supplierFields';
import { useBulkImportSuppliersMutation, useGetSuppliersForExportQuery } from '@/store/hooks';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function SupplierImportModal({ isOpen, onClose }: Props) {
  const [bulkImport, { isLoading }] = useBulkImportSuppliersMutation();
  const { data: suppliers = [] } = useGetSuppliersForExportQuery(undefined, { skip: !isOpen });

  return (
    <EntityImportModal<MappedImportRow>
      isOpen={isOpen}
      onClose={onClose}
      title="Import suppliers"
      fields={SUPPLIER_IMPORT_FIELDS}
      previewLabelKey="name"
      duplicateNote="Synced suppliers from the party API cannot be updated via import. Local duplicates can be updated."
      onDownloadTemplate={downloadSupplierImportTemplate}
      existingRecords={suppliers.map((s) => ({ id: s.id, name: s.name, source: s.source }))}
      isSubmitting={isLoading}
      mapRow={mapSupplierImportRow}
      toPayload={(row: ImportPreviewRow<MappedImportRow>) => supplierImportRowToPayload(row)}
      blockDuplicateUpdate={(match) =>
        match.source === 'PARTY_API_SYNC' ? 'Synced from party API — cannot update via import' : null
      }
      onSubmit={async ({ newRows, updateRows }, onProgress) => {
        try {
          const result = await runChunkedBulkImport(
            { newRows, updateRows },
            (chunk) => bulkImport(chunk).unwrap(),
            { onProgress }
          );
          const warn = result.skipped > 0 ? ` (${result.skipped} skipped)` : '';
          toast.success(`Imported ${result.created} new, updated ${result.updated}${warn}`);
          if (result.warnings.length > 0 && result.warnings.length <= 3) {
            result.warnings.forEach((w) => toast(w, { icon: '⚠️' }));
          } else if (result.warnings.length > 3) {
            toast(`${result.warnings.length} rows skipped — see warnings`, { icon: '⚠️' });
          }
        } catch (err: unknown) {
          toast.error(extractImportApiErrorMessage(err, 'Supplier import failed'), { duration: 8000 });
          throw err;
        }
      }}
    />
  );
}
