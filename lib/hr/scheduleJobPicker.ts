import type { Job, JobsListParams } from '@/store/api/endpoints/jobs';
import type { HrEmployeesListParams } from '@/store/api/endpoints/hr';
import { searchItems } from '@/lib/utils/fuzzyMatch';
import { jobToSearchItem, type ScheduleJobRow } from '@/lib/hr/scheduleSearchApi';

/** Shared RTK Query cache key for the schedule job picker list. */
export const SCHEDULE_JOB_PICKER_LIST_PARAMS: JobsListParams = {
  limit: 500,
  offset: 0,
  search: '',
  status: 'ALL',
  scope: 'VARIATION_ONLY',
};

/** Shared RTK Query cache key for schedule worker/driver pickers. */
export const SCHEDULE_EMPLOYEE_LIST_PARAMS: HrEmployeesListParams = {
  limit: 500,
  offset: 0,
  status: 'ACTIVE',
};

export function scheduleJobPickerParams(search: string): JobsListParams {
  return {
    ...SCHEDULE_JOB_PICKER_LIST_PARAMS,
    search: search.trim(),
  };
}

export function filterScheduleJobSearchItems<T extends { id: string; label: string; searchText?: string }>(
  items: T[],
  query: string,
) {
  const trimmed = query.trim();
  if (!trimmed) return items;
  return searchItems(items, trimmed, 0.2);
}

export function jobRecordToScheduleRow(job: Job): ScheduleJobRow {
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    status: job.status,
    customerName: job.customerName ?? null,
    description: job.description ?? null,
    projectDetails: job.projectDetails ?? null,
    projectType: job.projectType ?? null,
    projectQtyArea: job.projectQtyArea ?? null,
    quotationNumber: job.quotationNumber ?? null,
    lpoNumber: job.lpoNumber ?? null,
    site: job.site ?? null,
    finishedGoods: 'finishedGoods' in job ? job.finishedGoods : undefined,
    requiredExpertises: job.requiredExpertises,
  };
}

export function scheduleJobToSearchItem(job: Job | ScheduleJobRow) {
  return jobToSearchItem(jobRecordToScheduleRow(job as Job));
}
