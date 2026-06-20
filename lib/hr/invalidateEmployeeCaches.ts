import { notifyHrLiveUpdate } from '@/lib/hr/hrLiveUpdate';
import { appApi } from '@/store/api/appApi';
import type { AppDispatch } from '@/store/store';

/** Match RTK invalidation used after employee bulk import; pairs with server publishLiveUpdate. */
export function invalidateEmployeeCaches(dispatch: AppDispatch, detail?: Parameters<typeof notifyHrLiveUpdate>[0]) {
  dispatch(
    appApi.util.invalidateTags([
      { type: 'Employee', id: 'LIST' },
      { type: 'Employee', id: 'EXPORT' },
    ]),
  );
  notifyHrLiveUpdate(detail);
}
