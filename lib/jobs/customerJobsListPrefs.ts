import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';

export type JobStatusFilter = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
export type JobScopeFilter = 'ALL' | 'PARENT_ONLY' | 'VARIATION_ONLY';

export type CustomerJobsListPrefs = {
  searchQuery: string;
  statusFilter: JobStatusFilter;
  scopeFilter: JobScopeFilter;
  pageSize: number;
};

const STATUS_FILTERS = new Set<JobStatusFilter>(['ALL', 'ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']);
const SCOPE_FILTERS = new Set<JobScopeFilter>(['ALL', 'PARENT_ONLY', 'VARIATION_ONLY']);

export function customerJobsListPrefsKey(companyId: string) {
  return `customer-jobs-list-filters:${companyId}`;
}

function parsePrefs(raw: unknown): Partial<CustomerJobsListPrefs> | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const next: Partial<CustomerJobsListPrefs> = {};

  if (typeof record.searchQuery === 'string') {
    next.searchQuery = record.searchQuery;
  }
  if (typeof record.statusFilter === 'string' && STATUS_FILTERS.has(record.statusFilter as JobStatusFilter)) {
    next.statusFilter = record.statusFilter as JobStatusFilter;
  }
  if (typeof record.scopeFilter === 'string' && SCOPE_FILTERS.has(record.scopeFilter as JobScopeFilter)) {
    next.scopeFilter = record.scopeFilter as JobScopeFilter;
  }
  if (
    typeof record.pageSize === 'number' &&
    (LIST_PAGE_SIZE_OPTIONS as readonly number[]).includes(record.pageSize)
  ) {
    next.pageSize = record.pageSize;
  }

  return Object.keys(next).length > 0 ? next : null;
}

export function readCustomerJobsListPrefs(companyId: string): Partial<CustomerJobsListPrefs> | null {
  if (typeof window === 'undefined' || !companyId) return null;
  try {
    const raw = window.localStorage.getItem(customerJobsListPrefsKey(companyId));
    if (!raw) return null;
    return parsePrefs(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeCustomerJobsListPrefs(companyId: string, prefs: CustomerJobsListPrefs) {
  if (typeof window === 'undefined' || !companyId) return;
  try {
    window.localStorage.setItem(customerJobsListPrefsKey(companyId), JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}

export const DEFAULT_CUSTOMER_JOBS_LIST_PREFS: CustomerJobsListPrefs = {
  searchQuery: '',
  statusFilter: 'ALL',
  scopeFilter: 'ALL',
  pageSize: DEFAULT_LIST_PAGE_SIZE,
};
