'use client';

import { useMemo } from 'react';
import toast from 'react-hot-toast';

import EntityImportModal from '@/components/import-export/EntityImportModal';
import { extractImportApiErrorMessage } from '@/lib/import-export/apiErrors';
import { runChunkedBulkImport } from '@/lib/import-export/chunkedBulkImport';
import {
  JOB_VARIATION_IMPORT_FIELDS,
  downloadJobVariationImportTemplate,
  inferVariationParentFromJobNumber,
  jobVariationImportRowToPayload,
  mapJobVariationImportRow,
  resolveVariationImportRecordKey,
  variationDuplicateInFileMessage,
  type VariationParentLookup,
} from '@/lib/import-export/jobVariationFields';
import type { ImportPreviewRow, MappedImportRow } from '@/lib/import-export/types';
import { useBulkImportJobVariationsMutation, useGetJobsQuery } from '@/store/hooks';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function JobVariationImportModal({ isOpen, onClose }: Props) {
  const [bulkImport, { isLoading }] = useBulkImportJobVariationsMutation();
  const { data: jobs = [] } = useGetJobsQuery(undefined, { skip: !isOpen });

  const parentLookup = useMemo((): VariationParentLookup => {
    const parents = jobs.filter((job) => !job.parentJobId);
    return {
      byId: new Map(parents.map((p) => [p.id, p.jobNumber])),
      byNumber: new Map(parents.map((p) => [p.jobNumber.trim().toLowerCase(), p.jobNumber])),
    };
  }, [jobs]);

  const variations = jobs.filter((job) => job.parentJobId);

  return (
    <EntityImportModal<MappedImportRow>
      isOpen={isOpen}
      onClose={onClose}
      title="Import job variations"
      fields={JOB_VARIATION_IMPORT_FIELDS}
      previewLabelKey="parent_job_number"
      previewColumn2Key="variation_suffix"
      previewColumn2Label="Suffix"
      duplicateNote="Map Parent Job Number + Variation Suffix, or provide the full Job Number when the parent already exists (e.g. JOB-1001-1). Do not use Import parent jobs for variation rows."
      duplicateInFileLabel="variation (same parent + suffix)"
      duplicateMatchLabel="job number"
      onDownloadTemplate={downloadJobVariationImportTemplate}
      existingRecords={variations.map((j) => ({
        id: j.id,
        name: j.jobNumber.trim().toLowerCase(),
        source: j.source,
      }))}
      getRecordKey={(row) => resolveVariationImportRecordKey(row, parentLookup)}
      formatDuplicateInFileError={variationDuplicateInFileMessage}
      isSubmitting={isLoading}
      mapRow={(row, headers, mapping, rowIndex) => {
        const parsed = mapJobVariationImportRow(row, headers, mapping, rowIndex);
        if (parsed.__errors.length > 0) return parsed;

        const parentJobNumber = String(parsed.parent_job_number ?? '').trim();
        const parentJobId = String(parsed.parent_job_id ?? '').trim();
        const jobNumber = String(parsed.job_number ?? '').trim();

        if (!parentJobNumber && !parentJobId && jobNumber) {
          const inferred = inferVariationParentFromJobNumber(jobNumber, parentLookup);
          if (inferred) {
            parsed.parent_job_number = inferred.parentJobNumber;
            if (!String(parsed.variation_suffix ?? '').trim() && inferred.variationSuffix) {
              parsed.variation_suffix = inferred.variationSuffix;
            }
          } else {
            parsed.__errors.push(
              `No parent job matches "${jobNumber}". Create the parent first or add a Parent Job Number column.`,
            );
          }
        }

        return parsed;
      }}
      toPayload={(row: ImportPreviewRow<MappedImportRow>) => jobVariationImportRowToPayload(row)}
      blockDuplicateUpdate={(match) =>
        match.source === 'EXTERNAL_API' ? 'Synced from external API — cannot update via import' : null
      }
      onSubmit={async ({ newRows, updateRows }, onProgress) => {
        try {
          const result = await runChunkedBulkImport(
            { newRows, updateRows },
            (chunk) =>
              bulkImport({
                scope: 'variation',
                newRows: chunk.newRows,
                updateRows: chunk.updateRows,
              }).unwrap(),
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
          toast.error(extractImportApiErrorMessage(err, 'Job variation import failed'), { duration: 8000 });
          throw err;
        }
      }}
    />
  );
}
