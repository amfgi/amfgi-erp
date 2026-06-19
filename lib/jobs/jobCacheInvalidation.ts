import { appApi } from '@/store/api/appApi';
import type { AppDispatch } from '@/store/store';

/** RTK Query tags to refresh after job directory changes (create, variation, bulk import, external sync). */
export const JOB_CACHE_INVALIDATES = [
  'Job',
  'JobProfitability',
  'SupplierTraceability',
  'JobDailyQuantityLog',
] as const;

export function jobListInvalidationTags(jobIds: string[] = []) {
  const uniqueIds = [...new Set(jobIds.filter(Boolean))];
  return [
    { type: 'Job' as const, id: 'LIST' },
    ...uniqueIds.map((id) => ({ type: 'Job' as const, id })),
    ...JOB_CACHE_INVALIDATES.map((type) => ({ type })),
  ];
}

export function invalidateJobCaches(dispatch: AppDispatch, jobIds: string[] = []) {
  dispatch(appApi.util.invalidateTags(jobListInvalidationTags(jobIds)));
}
