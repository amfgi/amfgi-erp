'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import { cn } from '@/lib/utils';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import { useGetHrEmployeesQuery } from '@/store/api/endpoints/hr';

type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'EXITED';

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

export default function HrEmployeesPage() {
  const router = useRouter();
  const { openMenu } = useGlobalContextMenu();
  const { data: session } = useSession();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | EmployeeStatus>('ALL');
  const [employeeType, setEmployeeType] = useState<'ALL' | '__none__' | string>('ALL');
  const [portal, setPortal] = useState<'ALL' | 'enabled' | 'disabled'>('ALL');

  const deferredQuery = useDeferredValue(q);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.employee.view');
  const canEdit = isSA || perms.includes('hr.employee.edit');

  const {
    data: list = [],
    isLoading: loading,
    isFetching: refreshing,
  } = useGetHrEmployeesQuery(
    {
      q: deferredQuery,
      status,
    },
    { skip: !canView },
  );

  const employeeTypeChoices = useMemo(() => {
    const seen = new Set<string>();
    for (const employee of list) {
      const t = employee.employeeType?.trim();
      if (t) seen.add(t);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [list]);

  useEffect(() => {
    if (employeeType === 'ALL' || employeeType === '__none__') return;
    if (!employeeTypeChoices.includes(employeeType)) setEmployeeType('ALL');
  }, [employeeType, employeeTypeChoices]);

  const filteredList = useMemo(() => {
    return list.filter((employee) => {
      if (employeeType === '__none__') {
        if (employee.employeeType?.trim()) return false;
      } else if (employeeType !== 'ALL') {
        if ((employee.employeeType ?? '').trim() !== employeeType) return false;
      }
      if (portal === 'enabled' && !employee.portalEnabled) return false;
      if (portal === 'disabled' && employee.portalEnabled) return false;
      return true;
    });
  }, [list, employeeType, portal]);

  const totals = useMemo(() => {
    const active = filteredList.filter((employee) => employee.status === 'ACTIVE').length;
    const onLeave = filteredList.filter((employee) => employee.status === 'ON_LEAVE').length;
    const portalEnabled = filteredList.filter((employee) => employee.portalEnabled).length;
    return {
      total: filteredList.length,
      active,
      onLeave,
      portalEnabled,
    };
  }, [filteredList]);

  const openEmployeeProfile = (employeeId: string) => {
    router.push(`/hr/employees/${employeeId}`);
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
          <StatCard label="Employees" value={totals.total} hint="Current filtered view" />
          <StatCard label="Active" value={totals.active} hint="Available for operations" />
          <StatCard label="On leave" value={totals.onLeave} hint="Currently away" />
          <StatCard label="Portal enabled" value={totals.portalEnabled} hint="Self-service access" />
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2 sm:col-span-2 xl:col-span-1">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, employee code, or mobile number"
              />
            </div>
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</span>
              <Select value={status} onChange={(e) => setStatus(e.target.value as 'ALL' | EmployeeStatus)}>
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
                value={employeeType}
                onChange={(e) => setEmployeeType(e.target.value as 'ALL' | '__none__' | string)}
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
              <Select value={portal} onChange={(e) => setPortal(e.target.value as 'ALL' | 'enabled' | 'disabled')}>
                <option value="ALL">All</option>
                <option value="enabled">Enabled only</option>
                <option value="disabled">Disabled only</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {refreshing ? 'Refreshing records' : 'Directory status'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {filteredList.length} of {list.length} employee{list.length === 1 ? '' : 's'} shown
              </p>
            </div>
            {canEdit ? (
              <Link href="/hr/employees/new" className={buttonVariants({ size: 'sm' })}>
                Add employee
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Employee master table</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Double-click a row to open the profile. Right-click a row for actions.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Employee name', 'Code', 'Designation', 'Type', 'Status', 'Portal', 'Mobile number'].map(
                    (header) => (
                      <th
                        key={header}
                        className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground first:pl-5 last:pr-5"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                <TableSkeleton rows={6} columns={7} />
              </tbody>
            </table>
          </div>
        ) : list.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-lg font-semibold text-foreground">No employees found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Try adjusting the search or status filter, or create the first employee record for this company.
            </p>
            {canEdit ? (
              <div className="mt-5 flex justify-center">
                <Link href="/hr/employees/new" className={buttonVariants({ size: 'sm' })}>
                  Add employee
                </Link>
              </div>
            ) : null}
          </div>
        ) : filteredList.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-lg font-semibold text-foreground">No employees match these filters</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Clear type or portal filters, or widen search and status, to see more rows.
            </p>
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
                    Code
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Designation
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type</th>
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
                {filteredList.map((employee) => (
                  <tr
                    key={employee.id}
                    className="cursor-pointer align-top transition-colors hover:bg-muted/40"
                    onDoubleClick={() => openEmployeeProfile(employee.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openMenu(event.clientX, event.clientY, [
                        {
                          label: 'Open profile',
                          action: () => openEmployeeProfile(employee.id),
                        },
                      ]);
                    }}
                  >
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-medium text-foreground">{employee.fullName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {employee.preferredName && employee.preferredName !== employee.fullName
                            ? `Preferred: ${employee.preferredName}`
                            : 'Employee profile'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-emerald-600 dark:text-emerald-300/90">
                      {employee.employeeCode}
                    </td>
                    <td className="px-4 py-4">{employee.designation || 'Not set'}</td>
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-foreground">{prettyEmployeeType(employee.employeeType)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{employee.basicHoursPerDay || 0} h/day</p>
                      </div>
                    </td>
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
      </section>
    </div>
  );
}
