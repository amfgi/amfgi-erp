import { appApi } from '@/store/api/appApi';
import type { AppDispatch } from '@/store/store';

/** RTK Query tags to refresh after job directory changes (create, variation, bulk import, external sync). */
export const JOB_CACHE_INVALIDATES = [
  'Job',
  'JobProfitability',
  'SupplierTraceability',
  'JobDailyQuantityLog',
] as const;

export function invalidateJobCaches(dispatch: AppDispatch) {
  dispatch(appApi.util.invalidateTags([...JOB_CACHE_INVALIDATES]));
}
