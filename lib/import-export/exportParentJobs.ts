import { parentJobToExportRow } from '@/lib/import-export/parentJobFields';
import { downloadWorkbook } from '@/lib/import-export/xlsx';
import type { Job } from '@/store/api/endpoints/jobs';

export function exportParentJobsToXlsx(jobs: Job[]) {
  const parents = jobs.filter((job) => !job.parentJobId);
  const rows = parents.map(parentJobToExportRow);
  downloadWorkbook(`parent-jobs-export-${new Date().toISOString().slice(0, 10)}.xlsx`, [
    { name: 'Parent Jobs', rows },
  ]);
  return parents.length;
}
