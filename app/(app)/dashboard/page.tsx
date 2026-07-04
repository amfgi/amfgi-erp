'use client';

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import {
  BarChartPanel,
  DashboardSection,
  DashboardStatCard,
  type BarChartItem,
} from '@/components/dashboard';
import { WorkspaceHubHeader } from '@/components/workspace';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/shadcn/alert';
import { buttonVariants } from '@/components/ui/shadcn/button';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { StatCardSkeleton } from '@/components/ui/skeleton/StatCardSkeleton';
import { EMPLOYEE_PORTAL_HOME, isEmployeeSelfServiceUser } from '@/lib/auth/selfService';
import { cn } from '@/lib/utils';
import {
  useGetHrAttendanceOverviewQuery,
  useGetHrEmployeesPageQuery,
  useGetHrLeaveStatsQuery,
  useGetStockDashboardStatsQuery,
  useGetStockIntegrityQuery,
  useGetStockValuationQuery,
} from '@/store/hooks';

function currentMonthYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number, currencyCode: string) {
  return `${currencyCode} ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatMonthLabel(monthYmd: string) {
  try {
    const [year, month] = monthYmd.split('-');
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return monthYmd;
  }
}

function toDateYmd(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatShortDay(value: string | Date) {
  const ymd = toDateYmd(value);
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return ymd;
  }
}

function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <StatCardSkeleton key={index} />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const month = currentMonthYmd();

  if (status === 'loading') {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2 border-b border-border pb-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-64 max-w-full sm:w-96" />
          <Skeleton className="h-4 w-48" />
        </div>
        <StatCardsSkeleton count={8} />
      </div>
    );
  }

  if (!session?.user) {
    redirect('/login');
  }

  if (isEmployeeSelfServiceUser(session.user)) {
    redirect(EMPLOYEE_PORTAL_HOME);
  }

  if (!session.user.activeCompanyId) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        <div className="rounded-lg border border-border bg-card px-5 py-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workspace</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Select a company</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Choose an active company from the header to load modules for that workspace.
          </p>
          <Link href="/select-company" className={cn(buttonVariants({ variant: 'default' }), 'mt-4 inline-flex')}>
            Company selection
          </Link>
        </div>
        <Alert>
          <AlertTitle>No active company</AlertTitle>
          <AlertDescription>Use the company switcher in the top bar.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <DashboardContent
      companyName={session.user.activeCompanyName || 'Company workspace'}
      isSuperAdmin={session.user.isSuperAdmin ?? false}
      permissions={(session.user.permissions ?? []) as string[]}
      month={month}
    />
  );
}

function DashboardContent({
  companyName,
  isSuperAdmin,
  permissions,
  month,
}: {
  companyName: string;
  isSuperAdmin: boolean;
  permissions: string[];
  month: string;
}) {
  const canSeeMaterials = isSuperAdmin || permissions.includes('material.view');
  const canSeeBatches =
    isSuperAdmin || permissions.includes('material.view') || permissions.includes('transaction.stock_in');
  const canViewStock =
    canSeeMaterials ||
    canSeeBatches ||
    isSuperAdmin ||
    permissions.includes('transaction.stock_out') ||
    permissions.includes('transaction.reconcile') ||
    permissions.includes('transaction.adjust');

  const canViewHrEmployees = isSuperAdmin || permissions.includes('hr.employee.view');
  const canViewHrAttendance = isSuperAdmin || permissions.includes('hr.attendance.view');
  const canViewHrLeave =
    isSuperAdmin ||
    permissions.includes('hr.leave.view') ||
    permissions.includes('hr.leave.approve') ||
    permissions.includes('hr.leave.edit') ||
    permissions.includes('hr.leave.delete');

  const canViewHr = canViewHrEmployees || canViewHrAttendance || canViewHrLeave;

  const { data: stockStats, isFetching: stockStatsLoading } = useGetStockDashboardStatsQuery(undefined, {
    skip: !canViewStock,
  });
  const { data: valuation, isFetching: valuationLoading } = useGetStockValuationQuery(undefined, {
    skip: !canViewStock,
  });
  const { data: integrity, isFetching: integrityLoading } = useGetStockIntegrityQuery(undefined, {
    skip: !canViewStock,
  });

  const { data: attendance, isFetching: attendanceLoading } = useGetHrAttendanceOverviewQuery(
    { month },
    { skip: !canViewHrAttendance },
  );
  const { data: leaveStats, isFetching: leaveStatsLoading } = useGetHrLeaveStatsQuery(undefined, {
    skip: !canViewHrLeave,
  });

  const { data: activeEmployees, isFetching: activeEmployeesLoading } = useGetHrEmployeesPageQuery(
    { limit: 1, offset: 0, status: 'ACTIVE' },
    { skip: !canViewHrEmployees },
  );
  const { data: onLeaveEmployees, isFetching: onLeaveEmployeesLoading } = useGetHrEmployeesPageQuery(
    { limit: 1, offset: 0, status: 'ON_LEAVE' },
    { skip: !canViewHrEmployees },
  );
  const { data: suspendedEmployees, isFetching: suspendedEmployeesLoading } = useGetHrEmployeesPageQuery(
    { limit: 1, offset: 0, status: 'SUSPENDED' },
    { skip: !canViewHrEmployees },
  );
  const { data: exitedEmployees, isFetching: exitedEmployeesLoading } = useGetHrEmployeesPageQuery(
    { limit: 1, offset: 0, status: 'EXITED' },
    { skip: !canViewHrEmployees },
  );

  const currencyCode = valuation?.summary.currencyCode ?? 'AED';
  const stockValue = valuation?.summary.totalStockValue ?? 0;
  const integrityIssues = integrity?.summary.materialsWithExceptions ?? 0;

  const warehouseChartItems: BarChartItem[] = useMemo(
    () =>
      (valuation?.warehouseBreakdown ?? []).slice(0, 6).map((row, index) => ({
        label: row.warehouseName,
        value: row.stockValue,
        displayValue: formatMoney(row.stockValue, currencyCode),
        tone: (['emerald', 'sky', 'amber', 'violet', 'rose', 'muted'] as const)[index % 6],
      })),
    [currencyCode, valuation?.warehouseBreakdown],
  );

  const topMaterialsChartItems: BarChartItem[] = useMemo(
    () =>
      (valuation?.topMaterialsByValue ?? []).slice(0, 6).map((row, index) => ({
        label: row.name,
        value: row.totalValue,
        displayValue: formatMoney(row.totalValue, currencyCode),
        tone: (['sky', 'emerald', 'amber', 'violet', 'rose', 'muted'] as const)[index % 6],
      })),
    [currencyCode, valuation?.topMaterialsByValue],
  );

  const attendanceDailyItems: BarChartItem[] = useMemo(() => {
    if (!attendance?.days?.length) return [];
    return [...attendance.days]
      .filter((day) => day.kind === 'saved' && day.attendanceRows > 0)
      .sort((a, b) => toDateYmd(a.workDate).localeCompare(toDateYmd(b.workDate)))
      .slice(-12)
      .map((day) => ({
        label: formatShortDay(day.workDate),
        value: day.attendanceRows,
        tone: 'emerald' as const,
      }));
  }, [attendance?.days]);

  const employeeStatusItems: BarChartItem[] = useMemo(
    () =>
      [
        { label: 'Active', value: activeEmployees?.total ?? 0, tone: 'emerald' as const },
        { label: 'On leave', value: onLeaveEmployees?.total ?? 0, tone: 'sky' as const },
        { label: 'Suspended', value: suspendedEmployees?.total ?? 0, tone: 'amber' as const },
        { label: 'Exited', value: exitedEmployees?.total ?? 0, tone: 'muted' as const },
      ].filter((row) => row.value > 0),
    [
      activeEmployees?.total,
      exitedEmployees?.total,
      onLeaveEmployees?.total,
      suspendedEmployees?.total,
    ],
  );

  const attendanceSummaryItems: BarChartItem[] = useMemo(() => {
    const stats = attendance?.monthStats;
    if (!stats) return [];
    return [
      { label: 'Fulfilled days', value: stats.fulfilledScheduleDays, tone: 'emerald' as const },
      { label: 'Pending days', value: stats.pendingScheduleDays, tone: 'amber' as const },
      { label: 'Published schedules', value: stats.publishedScheduleDays, tone: 'sky' as const },
    ].filter((row) => row.value > 0);
  }, [attendance?.monthStats]);

  const stockLoading = stockStatsLoading || valuationLoading || integrityLoading;
  const hrEmployeesLoading =
    activeEmployeesLoading || onLeaveEmployeesLoading || suspendedEmployeesLoading || exitedEmployeesLoading;
  const hrLoading = attendanceLoading || leaveStatsLoading || hrEmployeesLoading;

  const refreshing = stockLoading || hrLoading;

  if (!canViewStock && !canViewHr) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        <WorkspaceHubHeader
          eyebrow="Home"
          title={companyName}
          description="Your account does not have stock or HR visibility for this company."
        />
        <Alert>
          <AlertTitle>Limited access</AlertTitle>
          <AlertDescription>
            Ask an administrator to grant stock or HR permissions to see dashboard metrics here.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <WorkspaceHubHeader
        eyebrow="Home"
        title={companyName}
        description="Live stock and people metrics for your workspace."
        trailing={refreshing ? 'Refreshing…' : formatMonthLabel(month)}
      />

      {canViewStock ? (
        <DashboardSection
          title="Stock"
          description="Inventory value, materials, batches, and integrity from live balances."
          href="/stock"
          linkLabel="Open stock"
        >
          {stockLoading && !stockStats && !valuation ? (
            <StatCardsSkeleton />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <DashboardStatCard
                label="Stock value"
                value={formatMoney(stockValue, currencyCode)}
                hint={`${valuation?.summary.preferredMethod ?? 'FIFO'} preferred`}
                tone="emerald"
                href="/stock"
              />
              <DashboardStatCard
                label="Active materials"
                value={formatCount(stockStats?.activeMaterials ?? 0)}
                href="/stock/materials"
              />
              <DashboardStatCard
                label="Low stock alerts"
                value={formatCount(stockStats?.lowStockCount ?? 0)}
                hint="At or below reorder level"
                tone={(stockStats?.lowStockCount ?? 0) > 0 ? 'amber' : undefined}
                href="/stock/materials"
              />
              <DashboardStatCard
                label="Open batches"
                value={formatCount(stockStats?.openBatches ?? 0)}
                hint={`${formatCount(stockStats?.totalBatches ?? 0)} total batches`}
                tone="sky"
                href="/stock/stock-batches"
              />
              <DashboardStatCard
                label="Integrity issues"
                value={formatCount(integrityIssues)}
                hint="Materials with balance exceptions"
                tone={integrityIssues > 0 ? 'rose' : undefined}
                href="/stock/integrity"
              />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <BarChartPanel
              title="Stock value by warehouse"
              description="Preferred valuation method split across warehouses."
              items={warehouseChartItems}
              loading={valuationLoading && warehouseChartItems.length === 0}
              emptyMessage="No warehouse balances recorded yet."
              valueFormatter={(value) => formatMoney(value, currencyCode)}
            />
            <BarChartPanel
              title="Top materials by value"
              description="Highest-value items on hand right now."
              items={topMaterialsChartItems}
              loading={valuationLoading && topMaterialsChartItems.length === 0}
              emptyMessage="No valued materials yet."
              valueFormatter={(value) => formatMoney(value, currencyCode)}
            />
          </div>
        </DashboardSection>
      ) : null}

      {canViewHr ? (
        <DashboardSection
          title="People & HR"
          description={`Attendance, leave, and workforce headcount for ${formatMonthLabel(month)}.`}
          href="/hr/schedule"
          linkLabel="Open HR"
        >
          {hrLoading && !attendance && !leaveStats && !activeEmployees ? (
            <StatCardsSkeleton />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {canViewHrEmployees ? (
                <DashboardStatCard
                  label="Active employees"
                  value={formatCount(activeEmployees?.total ?? 0)}
                  href="/hr/employees"
                />
              ) : null}
              {canViewHrLeave ? (
                <>
                  <DashboardStatCard
                    label="Pending leave"
                    value={formatCount(leaveStats?.pendingCount ?? 0)}
                    hint="Awaiting decision"
                    tone={(leaveStats?.pendingCount ?? 0) > 0 ? 'amber' : undefined}
                    href="/hr/leave"
                  />
                  <DashboardStatCard
                    label="On leave today"
                    value={formatCount(leaveStats?.onLeaveToday ?? 0)}
                    tone="sky"
                    href="/hr/leave"
                  />
                </>
              ) : null}
              {canViewHrAttendance ? (
                <>
                  <DashboardStatCard
                    label="Attendance rows"
                    value={formatCount(attendance?.monthStats.attendanceRowCount ?? 0)}
                    hint="Recorded this month"
                    tone="emerald"
                    href="/hr/attendance"
                  />
                  <DashboardStatCard
                    label="Pending attendance"
                    value={formatCount(attendance?.monthStats.pendingScheduleDays ?? 0)}
                    hint="Published schedules without a sheet"
                    tone={(attendance?.monthStats.pendingScheduleDays ?? 0) > 0 ? 'amber' : undefined}
                    href="/hr/attendance"
                  />
                </>
              ) : null}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {canViewHrAttendance ? (
              <>
                <BarChartPanel
                  title="Schedule fulfillment"
                  description="Published work schedules versus attendance captured this month."
                  items={attendanceSummaryItems}
                  loading={attendanceLoading && attendanceSummaryItems.length === 0}
                  emptyMessage="No published schedules this month."
                />
                <BarChartPanel
                  title="Daily attendance volume"
                  description="Attendance rows saved on recent working days."
                  items={attendanceDailyItems}
                  loading={attendanceLoading && attendanceDailyItems.length === 0}
                  emptyMessage="No attendance sheets saved this month yet."
                />
              </>
            ) : null}
            {canViewHrEmployees ? (
              <BarChartPanel
                title="Workforce by status"
                description="Headcount grouped by employee profile status."
                items={employeeStatusItems}
                loading={hrEmployeesLoading && employeeStatusItems.length === 0}
                emptyMessage="No employees in the directory."
              />
            ) : null}
          </div>
        </DashboardSection>
      ) : null}
    </div>
  );
}
