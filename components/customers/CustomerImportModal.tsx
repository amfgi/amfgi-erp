'use client';

import toast from 'react-hot-toast';

import EntityImportModal from '@/components/import-export/EntityImportModal';
import { extractImportApiErrorMessage } from '@/lib/import-export/apiErrors';
import { runChunkedBulkImport } from '@/lib/import-export/chunkedBulkImport';
import {
  CUSTOMER_IMPORT_FIELDS,
  customerImportRowToPayload,
  downloadCustomerImportTemplate,
  mapCustomerImportRow,
} from '@/lib/import-export/customerFields';
import type { ImportPreviewRow, MappedImportRow } from '@/lib/import-export/types';
import { useBulkImportCustomersMutation, useGetCustomersForExportQuery } from '@/store/hooks';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function CustomerImportModal({ isOpen, onClose }: Props) {
  const [bulkImport, { isLoading }] = useBulkImportCustomersMutation();
  const { data: customers = [] } = useGetCustomersForExportQuery(undefined, { skip: !isOpen });

  return (
    <EntityImportModal<MappedImportRow>
      isOpen={isOpen}
      onClose={onClose}
      title="Import customers"
      fields={CUSTOMER_IMPORT_FIELDS}
      previewLabelKey="name"
      duplicateNote="Synced customers from the party API cannot be updated via import. Local duplicates can be updated."
      onDownloadTemplate={downloadCustomerImportTemplate}
      existingRecords={customers.map((c) => ({ id: c.id, name: c.name, source: c.source }))}
      isSubmitting={isLoading}
      mapRow={mapCustomerImportRow}
      toPayload={(row: ImportPreviewRow<MappedImportRow>) => customerImportRowToPayload(row)}
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
            toast(`${result.warnings.length} rows skipped`, { icon: '⚠️' });
          }
        } catch (err: unknown) {
          toast.error(extractImportApiErrorMessage(err, 'Customer import failed'), { duration: 8000 });
          throw err;
        }
      }}
    />
  );
}
