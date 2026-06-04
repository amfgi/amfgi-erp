import { jobVariationToExportRow } from '@/lib/import-export/jobVariationFields';
import { downloadWorkbook } from '@/lib/import-export/xlsx';
import type { Job } from '@/store/api/endpoints/jobs';

export function exportJobVariationsToXlsx(jobs: Job[]) {
  const parentNumberById = new Map(
    jobs
      .filter((job) => !job.parentJobId)
      .map((job) => [job.id, job.jobNumber] as const)
  );

  const variations = jobs.filter((job) => job.parentJobId);
  const rows = variations.map((job) => {
    const parentNumber =
      parentNumberById.get(job.parentJobId!) ??
      jobs.find((p) => p.id === job.parentJobId)?.jobNumber ??
      '';
    return jobVariationToExportRow(job, parentNumber);
  });

  downloadWorkbook(`job-variations-export-${new Date().toISOString().slice(0, 10)}.xlsx`, [
    { name: 'Variations', rows },
  ]);
  return rows.length;
}
