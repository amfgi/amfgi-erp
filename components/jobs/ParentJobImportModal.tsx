'use client';

import toast from 'react-hot-toast';

import EntityImportModal from '@/components/import-export/EntityImportModal';
import {
  PARENT_JOB_IMPORT_FIELDS,
  downloadParentJobImportTemplate,
  mapParentJobImportRow,
  parentJobImportRowToPayload,
} from '@/lib/import-export/parentJobFields';
import type { ImportPreviewRow, MappedImportRow } from '@/lib/import-export/types';
import { useBulkImportParentJobsMutation, useGetJobsQuery } from '@/store/hooks';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function ParentJobImportModal({ isOpen, onClose }: Props) {
  const [bulkImport, { isLoading }] = useBulkImportParentJobsMutation();
  const { data: jobs = [] } = useGetJobsQuery(undefined, { skip: !isOpen });

  const parentJobs = jobs.filter((job) => !job.parentJobId);

  return (
    <EntityImportModal<MappedImportRow>
      isOpen={isOpen}
      onClose={onClose}
      title="Import parent jobs"
      fields={PARENT_JOB_IMPORT_FIELDS}
      previewLabelKey="job_number"
      previewColumn2Key="customer_name"
      previewColumn2Label="Customer"
      duplicateNote="Parent jobs synced from the external API cannot be updated via import. Local duplicates can be updated."
      onDownloadTemplate={downloadParentJobImportTemplate}
      existingRecords={parentJobs.map((j) => ({
        id: j.id,
        name: j.jobNumber,
        source: j.source,
      }))}
      isSubmitting={isLoading}
      mapRow={mapParentJobImportRow}
      toPayload={(row: ImportPreviewRow<MappedImportRow>) => parentJobImportRowToPayload(row)}
      blockDuplicateUpdate={(match) =>
        match.source === 'EXTERNAL_API' ? 'Synced from external API — cannot update via import' : null
      }
      onSubmit={async ({ newRows, updateRows }) => {
        try {
          const result = await bulkImport({
            scope: 'parent',
            newRows,
            updateRows,
          }).unwrap();
          const warn = result.warnings.length > 0 ? ` (${result.skipped} skipped)` : '';
          toast.success(`Imported ${result.created} new, updated ${result.updated}${warn}`);
          if (result.warnings.length > 0 && result.warnings.length <= 3) {
            result.warnings.forEach((w) => toast(w, { icon: '⚠️' }));
          } else if (result.warnings.length > 3) {
            toast(`${result.warnings.length} rows skipped`, { icon: '⚠️' });
          }
        } catch (err: unknown) {
          const message =
            typeof err === 'object' &&
            err !== null &&
            'data' in err &&
            typeof (err as { data?: { error?: unknown } }).data?.error === 'string'
              ? (err as { data: { error: string } }).data.error
              : 'Import failed';
          toast.error(message);
          throw err;
        }
      }}
    />
  );
}
