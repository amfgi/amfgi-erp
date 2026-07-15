'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LayoutGrid, Table2 } from 'lucide-react';
import { useSession } from 'next-auth/react';

import EmployeeImportModal from '@/components/hr/EmployeeImportModal';
import EmployeeExportModal from '@/components/hr/EmployeeExportModal';
import EmployeeDeleteModal from '@/components/hr/EmployeeDeleteModal';
import { EmployeeAvatar } from '@/components/hr/EmployeeAvatar';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import DirectoryListPagination from '@/components/ui/DirectoryListPagination';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import { DEFAULT_LIST_PAGE_SIZE, parseListLimit } from '@/lib/pagination/serverList';
import { formatDirectoryCompensationAmount } from '@/lib/import-export/employeeCompensationFields';
import { canHrCompensationView } from '@/lib/hr/compensationPermissions';
import { rememberHrEmployeesDirectoryUrl } from '@/lib/hr/employeesDirectoryUrl';
import { cn } from '@/lib/utils';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import {
  useGetHrEmployeesPageQuery,
  HR_EMPLOYEE_PAGE_SIZE_OPTIONS,
  type HrEmployee,
} from '@/store/api/endpoints/hr';

type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'EXITED';
type DirectoryViewMode = 'table' | 'grid';
type PortalFilter = 'ALL' | 'enabled' | 'disabled';
type CompensationFilter = 'ALL' | 'set' | 'not_set';

const VIEW_MODE_STORAGE_KEY = 'hr-employees-view-mode';
const STATUS_VALUES = new Set(['ALL', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXITED']);
const PORTAL_VALUES = new Set(['ALL', 'enabled', 'disabled']);
const COMPENSATION_VALUES = new Set(['ALL', 'set', 'not_set']);

function parseStatus(raw: string | null): 'ALL' | EmployeeStatus {
  if (raw && STATUS_VALUES.has(raw)) return raw as 'ALL' | EmployeeStatus;
  return 'ALL';
}

function parsePortal(raw: string | null): PortalFilter {
  if (raw && PORTAL_VALUES.has(raw)) return raw as PortalFilter;
  return 'ALL';
}

function parseCompensation(raw: string | null): CompensationFilter {
  if (raw && COMPENSATION_VALUES.has(raw)) return raw as CompensationFilter;
  return 'ALL';
}

function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

function buildDirectorySearchParams(input: {
  q: string;
  status: 'ALL' | EmployeeStatus;
  employeeType: string;
  portal: PortalFilter;
  compensation: CompensationFilter;
  page: number;
  pageSize: number;
  includeCompensation: boolean;
}): URLSearchParams {
  const params = new URLSearchParams();
  const trimmedQ = input.q.trim();
  if (trimmedQ) params.set('q', trimmedQ);
  if (input.status !== 'ALL') params.set('status', input.status);
  if (input.employeeType !== 'ALL') params.set('employeeType', input.employeeType);
  if (input.portal !== 'ALL') params.set('portal', input.portal);
  if (input.includeCompensation && input.compensation !== 'ALL') {
    params.set('compensation', input.compensation);
  }
  if (input.page > 1) params.set('page', String(input.page));
  if (input.pageSize !== DEFAULT_LIST_PAGE_SIZE) params.set('pageSize', String(input.pageSize));
  return params;
}

const STATUS_OPTIONS: Array<{ value: 'ALL' | EmployeeStatus; label: string }> = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'EXITED', label: 'Exited' },
];

const statusBadgeClasses: Record<EmployeeStatus, string> = {
  ACTIVE:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 uppercase tracking-[0.18em] text-[11px] dark:text-emerald-300',
  ON_LEAVE:
    'border-amber-500/30 bg-amber-500/10 text-amber-800 uppercase tracking-[0.18em] text-[11px] dark:text-amber-300',
  SUSPENDED:
    'border-red-500/30 bg-red-500/10 text-red-700 uppercase tracking-[0.18em] text-[11px] dark:text-red-400',
  EXITED:
    'border-slate-500/30 bg-slate-500/10 text-slate-700 uppercase tracking-[0.18em] text-[11px] dark:text-slate-300',
};

function prettyStatus(status: EmployeeStatus) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function prettyEmployeeType(type: string | null | undefined) {
  const t = (type ?? '').trim();
  if (!t) return 'Not set';
  return t
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function initialViewMode(): DirectoryViewMode {
  if (typeof window === 'undefined') return 'table';
  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  if (stored === 'table' || stored === 'grid') return stored;
  return window.matchMedia('(max-width: 767px)').matches ? 'grid' : 'table';
}

function DirectoryViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: DirectoryViewMode;
  onChange: (mode: DirectoryViewMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
      role="group"
      aria-label="Directory view"
    >
      <button
        type="button"
        onClick={() => onChange('table')}
        aria-pressed={viewMode === 'table'}
        aria-label="Table view"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
          viewMode === 'table'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Table2 className="size-3.5 shrink-0" />
        Table
      </button>
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-pressed={viewMode === 'grid'}
        aria-label="Grid view"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
          viewMode === 'grid'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <LayoutGrid className="size-3.5 shrink-0" />
        Grid
      </button>
    </div>
  );
}

function EmployeeCompensationSummary({
  compensation,
}: {
  compensation: HrEmployee['currentCompensation'];
}) {
  if (!compensation) {
    return <span className="text-muted-foreground">Not set</span>;
  }

  return (
    <div>
      <p className="text-foreground">{compensation.payTypeName}</p>
      <p className="mt-1 tabular-nums text-xs text-muted-foreground">
        {formatDirectoryCompensationAmount(compensation)}
      </p>
    </div>
  );
}

function EmployeeGridCard({
  employee,
  onOpen,
  onContextMenu,
  showCompensation,
}: {
  employee: HrEmployee;
  onOpen: (employeeId: string) => void;
  onContextMenu: (event: MouseEvent, employeeId: string) => void;
  showCompensation: boolean;
}) {
  return (
    <article
      className="flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-muted/30"
      onDoubleClick={() => onOpen(employee.id)}
      onContextMenu={(event) => onContextMenu(event, employee.id)}
    >
      <div className="flex flex-col items-center border-b border-border bg-muted/20 px-4 pb-4 pt-5 text-center">
        <EmployeeAvatar name={employee.fullName} photoUrl={employee.photoUrl} size="lg" />
        <h3 className="mt-4 line-clamp-2 text-sm font-semibold text-foreground">{employee.fullName}</h3>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 py-3 text-sm">
        <p className="line-clamp-1 text-muted-foreground">{employee.designation || 'No designation'}</p>
        <p className="text-foreground">{prettyEmployeeType(employee.employeeType)}</p>
        {showCompensation ? (
          <div className="text-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Compensation</p>
            <EmployeeCompensationSummary compensation={employee.currentCompensation} />
          </div>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="outline" className={cn('font-medium', statusBadgeClasses[employee.status])}>
            {prettyStatus(employee.status)}
          </Badge>
          <span
            className={cn(
              'text-xs',
              employee.portalEnabled ? 'font-medium text-sky-600 dark:text-sky-300' : 'text-muted-foreground',
            )}
          >
            {employee.portalEnabled ? 'Portal on' : 'Portal off'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{employee.phone || 'No mobile number'}</p>
      </div>
    </article>
  );
}

function EmployeeGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-col items-center border-b border-border px-4 pb-4 pt-5">
            <div className="h-28 w-28 animate-pulse rounded-2xl bg-muted" />
            <div className="mt-4 h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2 px-4 py-3">
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HrEmployeesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openMenu } = useGlobalContextMenu();
  const { data: session } = useSession();

  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const [status, setStatus] = useState<'ALL' | EmployeeStatus>(() => parseStatus(searchParams.get('status')));
  const [employeeType, setEmployeeType] = useState<'ALL' | '__none__' | string>(
    () => searchParams.get('employeeType') ?? 'ALL',
  );
  const [portal, setPortal] = useState<PortalFilter>(() => parsePortal(searchParams.get('portal')));
  const [compensation, setCompensation] = useState<CompensationFilter>(() =>
    parseCompensation(searchParams.get('compensation')),
  );
  const [pageSize, setPageSizeState] = useState(() =>
    parseListLimit(searchParams.get('pageSize'), HR_EMPLOYEE_PAGE_SIZE_OPTIONS),
  );
  const [page, setPageState] = useState(() => parsePage(searchParams.get('page')));

  const deferredQuery = useDeferredValue(q);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.employee.view');
  const canViewCompensation = session?.user ? canHrCompensationView(session.user) : false;
  const canCreate = isSA || perms.includes('hr.employee.create');
  const canDelete = isSA || perms.includes('hr.employee.delete');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HrEmployee | null>(null);
  const [viewMode, setViewModeState] = useState<DirectoryViewMode>(() => initialViewMode());

  const setViewMode = useCallback((mode: DirectoryViewMode) => {
    setViewModeState(mode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    }
  }, []);

  const setPage = useCallback((next: number) => {
    setPageState(Math.max(1, next));
  }, []);

  const setPageSize = useCallback((next: number) => {
    setPageSizeState(next);
    setPageState(1);
  }, []);

  const setStatusFilter = useCallback((next: 'ALL' | EmployeeStatus) => {
    setStatus(next);
    setPageState(1);
  }, []);

  const setEmployeeTypeFilter = useCallback((next: 'ALL' | '__none__' | string) => {
    setEmployeeType(next);
    setPageState(1);
  }, []);

  const setPortalFilter = useCallback((next: PortalFilter) => {
    setPortal(next);
    setPageState(1);
  }, []);

  const setCompensationFilter = useCallback((next: CompensationFilter) => {
    setCompensation(next);
    setPageState(1);
  }, []);

  const setSearchQuery = useCallback((next: string) => {
    setQ(next);
    setPageState(1);
  }, []);

  useEffect(() => {
    const params = buildDirectorySearchParams({
      q: deferredQuery,
      status,
      employeeType,
      portal,
      compensation,
      page,
      pageSize,
      includeCompensation: canViewCompensation,
    });
    const next = params.toString();
    const current =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search).toString() : searchParams.toString();
    const href = next ? `/hr/employees?${next}` : '/hr/employees';
    rememberHrEmployeesDirectoryUrl(href);
    if (next !== current) {
      router.replace(href, { scroll: false });
    }
  }, [
    deferredQuery,
    status,
    employeeType,
    portal,
    compensation,
    page,
    pageSize,
    canViewCompensation,
    router,
    searchParams,
  ]);

  const {
    data: employeesPage,
    isLoading: loading,
    isFetching: refreshing,
  } = useGetHrEmployeesPageQuery(
    {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      q: deferredQuery,
      status,
      employeeType,
      portal,
      ...(canViewCompensation && compensation !== 'ALL' ? { compensation } : {}),
    },
    { skip: !canView },
  );

  const list = employeesPage?.items ?? [];
  const totalEmployees = employeesPage?.total ?? 0;
  const employeeTypeChoices = useMemo(
    () => employeesPage?.employeeTypes ?? [],
    [employeesPage?.employeeTypes],
  );
  const selectedEmployeeType =
    employeeType === 'ALL' ||
    employeeType === '__none__' ||
    employeeTypeChoices.includes(employeeType)
      ? employeeType
      : 'ALL';
  const stats = employeesPage?.stats ?? { active: 0, onLeave: 0, portalEnabled: 0 };

  const totalPages = Math.max(1, Math.ceil(totalEmployees / pageSize));
  const pageStart = totalEmployees === 0 ? 0 : (page - 1) * pageSize;

  useEffect(() => {
    if (!employeesPage) return;
    if (page > totalPages) setPageState(totalPages);
  }, [employeesPage, page, totalPages]);

  const openEmployeeProfile = (employeeId: string) => {
    router.push(`/hr/employees/${employeeId}`);
  };

  const openEmployeeContextMenu = (event: MouseEvent, employeeId: string) => {
    event.preventDefault();
    const employee = list.find((row) => row.id === employeeId);
    openMenu(event.clientX, event.clientY, [
      {
        label: 'Open profile',
        action: () => openEmployeeProfile(employeeId),
      },
      ...(canDelete && employee
        ? [
            {
              label: 'Delete employee',
              danger: true as const,
              action: () => setDeleteTarget(employee),
            },
          ]
        : []),
    ]);
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to view employee records for this company.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="w-full min-w-0 space-y-6 border-b border-border pb-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workforce</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Employee directory</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Maintain employee master data and open full profiles for documents, access, and employment details.
          </p>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Employees" value={totalEmployees} hint="Matching current filters" />
          <StatCard label="Active" value={stats.active} hint="Matching current filters" />
          <StatCard label="On leave" value={stats.onLeave} hint="Matching current filters" />
          <StatCard label="Portal enabled" value={stats.portalEnabled} hint="Matching current filters" />
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div
            className={cn(
              'grid min-w-0 flex-1 gap-4 sm:grid-cols-2',
              canViewCompensation ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
            )}
          >
            <div className="space-y-2 sm:col-span-2 xl:col-span-1">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
              <Input
                value={q}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, employee code, or mobile number"
              />
            </div>
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</span>
              <Select value={status} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | EmployeeStatus)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type</span>
              <Select
                value={selectedEmployeeType}
                onChange={(e) => setEmployeeTypeFilter(e.target.value as 'ALL' | '__none__' | string)}
              >
                <option value="ALL">All types</option>
                <option value="__none__">No type</option>
                {employeeTypeChoices.map((t) => (
                  <option key={t} value={t}>
                    {prettyEmployeeType(t)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Portal</span>
              <Select value={portal} onChange={(e) => setPortalFilter(e.target.value as PortalFilter)}>
                <option value="ALL">All</option>
                <option value="enabled">Enabled only</option>
                <option value="disabled">Disabled only</option>
              </Select>
            </div>
            {canViewCompensation ? (
              <div className="space-y-2">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Compensation
                </span>
                <Select
                  value={compensation}
                  onChange={(e) => setCompensationFilter(e.target.value as CompensationFilter)}
                >
                  <option value="ALL">All</option>
                  <option value="set">Compensation set</option>
                  <option value="not_set">Not set</option>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {refreshing ? 'Refreshing records' : 'Directory status'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {list.length} of {totalEmployees} employee{totalEmployees === 1 ? '' : 's'} on this page
              </p>
            </div>
            {canView ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setExportModalOpen(true)}>
                Export
              </Button>
            ) : null}
            {canCreate ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setImportModalOpen(true)}>
                Import
              </Button>
            ) : null}
            {canCreate ? (
              <Link href="/hr/employees/new" className={buttonVariants({ size: 'sm' })}>
                Add employee
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <EmployeeImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />
      <EmployeeExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        directoryFilters={{
          q: deferredQuery,
          status,
          employeeType: selectedEmployeeType,
          portal,
          ...(canViewCompensation && compensation !== 'ALL' ? { compensation } : {}),
        }}
        employeeTypeChoices={employeeTypeChoices}
      />
      <EmployeeDeleteModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        employee={deleteTarget}
      />

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Employee directory</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {viewMode === 'grid'
                ? 'Double-click a card to open the profile. Right-click for actions.'
                : 'Double-click a row to open the profile. Right-click a row for actions.'}
            </p>
          </div>
          <DirectoryViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>

        {loading ? (
          viewMode === 'grid' ? (
            <EmployeeGridSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="bg-muted/50">
                  <tr>
                  {[
                    'Employee name',
                    'Designation',
                    'Type',
                    ...(canViewCompensation ? ['Compensation'] : []),
                    'Status',
                    'Portal',
                    'Mobile number',
                  ].map((header) => (
                      <th
                        key={header}
                        className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground first:pl-5 last:pr-5"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <TableSkeleton rows={6} columns={canViewCompensation ? 7 : 6} />
                </tbody>
              </table>
            </div>
          )
        ) : totalEmployees === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-lg font-semibold text-foreground">No employees found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Try adjusting the search or status filter, or create the first employee record for this company.
            </p>
            {canCreate ? (
              <div className="mt-5 flex justify-center">
                <Link href="/hr/employees/new" className={buttonVariants({ size: 'sm' })}>
                  Add employee
                </Link>
              </div>
            ) : null}
          </div>
        ) : list.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-lg font-semibold text-foreground">No employees on this page</h3>
            <p className="mt-2 text-sm text-muted-foreground">Try another page or adjust filters.</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {list.map((employee) => (
              <EmployeeGridCard
                key={employee.id}
                employee={employee}
                onOpen={openEmployeeProfile}
                onContextMenu={openEmployeeContextMenu}
                showCompensation={canViewCompensation}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Employee name
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Designation
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                  {canViewCompensation ? (
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Compensation
                    </th>
                  ) : null}
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Portal
                  </th>
                  <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Mobile number
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-muted-foreground">
                {list.map((employee) => (
                  <tr
                    key={employee.id}
                    className="cursor-pointer align-top transition-colors hover:bg-muted/40"
                    onDoubleClick={() => openEmployeeProfile(employee.id)}
                    onContextMenu={(event) => openEmployeeContextMenu(event, employee.id)}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <EmployeeAvatar name={employee.fullName} photoUrl={employee.photoUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{employee.fullName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {employee.preferredName && employee.preferredName !== employee.fullName
                              ? `Preferred: ${employee.preferredName}`
                              : 'Employee profile'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">{employee.designation || 'Not set'}</td>
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-foreground">{prettyEmployeeType(employee.employeeType)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{employee.basicHoursPerDay || 0} h/day</p>
                      </div>
                    </td>
                    {canViewCompensation ? (
                      <td className="px-4 py-4">
                        <EmployeeCompensationSummary compensation={employee.currentCompensation} />
                      </td>
                    ) : null}
                    <td className="px-4 py-4">
                      <Badge variant="outline" className={cn('font-medium', statusBadgeClasses[employee.status])}>
                        {prettyStatus(employee.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={employee.portalEnabled ? 'font-medium text-sky-600 dark:text-sky-300' : undefined}
                      >
                        {employee.portalEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-4">{employee.phone || 'Not added'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalEmployees > 0 ? (
          <div className="border-t border-border px-5 py-4">
            <DirectoryListPagination
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              total={totalEmployees}
              pageStart={pageStart}
              pageEnd={pageStart + list.length}
              pageSizeOptions={HR_EMPLOYEE_PAGE_SIZE_OPTIONS}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
