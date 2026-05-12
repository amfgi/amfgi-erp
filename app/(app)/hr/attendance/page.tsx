'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { cn } from '@/lib/utils';
import { useGetHrAttendanceOverviewQuery } from '@/store/api/endpoints/hr';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  try {
    return new Date(value).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

function StatusPill({ status }: { status: 'DRAFT' | 'PUBLISHED' | 'LOCKED' }) {
  const className =
    status === 'LOCKED'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
      : status === 'PUBLISHED'
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
        : 'border-border bg-muted/50 text-muted-foreground';

  return (
    <Badge variant="outline" className={cn('font-medium', className)}>
      {status}
    </Badge>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  hint: string;
  tone?: 'default' | 'emerald' | 'amber';
}) {
  const valueClass =
    tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-foreground';

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('mt-2 text-2xl font-semibold tabular-nums', valueClass)}>{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyState({ message, tone = 'default' }: { message: string; tone?: 'default' | 'emerald' }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground',
        tone === 'emerald' &&
          'border-emerald-500/25 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200',
      )}
    >
      {message}
    </div>
  );
}

export default function HrAttendancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [workDate] = useState(searchParams.get('workDate') || todayYmd());
  const [convertingScheduleId, setConvertingScheduleId] = useState<string | null>(null);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.attendance.view');
  const canEdit = isSA || perms.includes('hr.attendance.edit');
  const {
    data: overview,
    isLoading: loading,
    refetch: refreshOverview,
  } = useGetHrAttendanceOverviewQuery(workDate, { skip: !canView });

  const convertScheduleToAttendance = async (scheduleId: string) => {
    setConvertingScheduleId(scheduleId);
    const res = await fetch(`/api/hr/schedule/${scheduleId}/generate-attendance`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Failed to convert schedule');
    else {
      toast.success('Attendance generated from published schedule');
      const generatedDate =
        String(json?.data?.workDate ?? '').slice(0, 10) ||
        overview?.pendingSchedules.find((item) => item.id === scheduleId)?.workDate?.slice(0, 10) ||
        workDate;
      router.push(`/hr/attendance/create?workDate=${encodeURIComponent(generatedDate)}`);
    }
    setConvertingScheduleId(null);
  };

  const deleteAttendanceByDate = async (dateYmd: string) => {
    if (!window.confirm(`Delete all attendance entries for ${dateYmd}?`)) return;
    setDeletingDate(dateYmd);
    const res = await fetch(`/api/hr/attendance?workDate=${encodeURIComponent(dateYmd)}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Delete failed');
    } else {
      toast.success(`Deleted ${json.data?.deletedRows ?? 0} rows`);
      await refreshOverview();
    }
    setDeletingDate(null);
  };

  const selectedSchedule = overview?.selectedDay.schedule ?? null;
  const hasAttendance = overview?.selectedDay.hasAttendance ?? false;
  const nextPendingSchedule = overview?.pendingSchedules[0] ?? null;
  const nextPendingDate = nextPendingSchedule ? String(nextPendingSchedule.workDate).slice(0, 10) : null;

  const dayState = useMemo(() => {
    if (!selectedSchedule) {
      return {
        title: 'Schedule missing',
        description:
          'Create the day schedule first, then return here to generate or review attendance.',
        tone: 'text-muted-foreground',
      };
    }
    if (selectedSchedule.status === 'DRAFT') {
      return {
        title: 'Planning still in draft',
        description:
          'Teams and timing need to be finalized and published before attendance can be generated cleanly.',
        tone: 'text-amber-700 dark:text-amber-300',
      };
    }
    if (selectedSchedule.needsAttendance) {
      return {
        title: 'Ready for attendance generation',
        description: 'The schedule is published and waiting to be converted into attendance rows.',
        tone: 'text-emerald-700 dark:text-emerald-300',
      };
    }
    return {
      title: 'Attendance already available',
      description: 'Rows exist for this date and can be reviewed, adjusted, or cleared if needed.',
      tone: 'text-emerald-700 dark:text-emerald-300',
    };
  }, [selectedSchedule]);

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to view HR attendance.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading && !overview) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <div className="h-28 animate-pulse rounded-lg border border-border bg-muted/30" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-muted/30" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-80 animate-pulse rounded-lg border border-border bg-muted/30" />
          <div className="h-64 animate-pulse rounded-lg border border-border bg-muted/30" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="w-full min-w-0 border-b border-border pb-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HR attendance</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Attendance overview</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            A clean control point for daily attendance generation, review, and corrections.
          </p>
        </div>
      </header>

      {overview ? (
        <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Published schedules"
            value={overview.monthStats.publishedScheduleDays}
            hint="Days already planned and published this month"
          />
          <SummaryCard
            label="Attendance completed"
            value={overview.monthStats.fulfilledScheduleDays}
            hint="Published days already converted to attendance"
            tone="emerald"
          />
          <SummaryCard
            label="Waiting to convert"
            value={overview.monthStats.pendingScheduleDays}
            hint="Published days that still need attendance rows"
            tone="amber"
          />
          <SummaryCard
            label="Rows this month"
            value={overview.monthStats.attendanceRowCount}
            hint="Saved attendance rows across the current month"
          />
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Panel
          title="Next pending attendance"
          description="The next published schedule that still needs attendance rows, with the fastest action to move it forward."
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Next pending date
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-foreground">
                      {nextPendingDate ? formatDateLabel(nextPendingDate) : formatDateLabel(workDate)}
                    </h2>
                    <p
                      className={cn(
                        'mt-2 text-sm font-medium',
                        nextPendingSchedule ? 'text-emerald-700 dark:text-emerald-300' : dayState.tone,
                      )}
                    >
                      {nextPendingSchedule ? 'Ready for attendance generation' : dayState.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {nextPendingSchedule
                        ? 'This is the earliest published schedule still waiting to be converted into attendance rows.'
                        : 'There are no pending published schedules right now, so you can review the currently selected date instead.'}
                    </p>
                  </div>
                  {nextPendingSchedule ? (
                    <StatusPill status="PUBLISHED" />
                  ) : selectedSchedule ? (
                    <StatusPill status={selectedSchedule.status} />
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Groups planned</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                    {nextPendingSchedule?.assignmentCount ?? selectedSchedule?._count.assignments ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Pending published days
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                    {overview?.monthStats.pendingScheduleDays ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Existing rows</p>
                  <p
                    className={cn(
                      'mt-2 text-2xl font-semibold tabular-nums',
                      nextPendingSchedule
                        ? 'text-amber-700 dark:text-amber-300'
                        : hasAttendance
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-amber-700 dark:text-amber-300',
                    )}
                  >
                    {nextPendingSchedule?.attendanceRows ?? overview?.selectedDay.attendanceRows ?? 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Next action</p>
              {nextPendingSchedule ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Adjust timing or team if you need to make changes.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push(`/hr/schedule/${nextPendingDate}`)}
                  >
                    Open schedule
                  </Button>
                  {canEdit ? (
                    <Button
                      type="button"
                      className="w-full"
                      disabled={convertingScheduleId === nextPendingSchedule.id}
                      onClick={() => void convertScheduleToAttendance(nextPendingSchedule.id)}
                    >
                      {convertingScheduleId === nextPendingSchedule.id ? 'Generating…' : 'Generate attendance'}
                    </Button>
                  ) : null}
                </div>
              ) : !selectedSchedule ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Create the schedule first, then return here.</p>
                  <Button type="button" className="w-full" onClick={() => router.push(`/hr/schedule/${workDate}`)}>
                    Create schedule
                  </Button>
                </div>
              ) : selectedSchedule.status === 'DRAFT' ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Finish planning and publish the day.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push(`/hr/schedule/${workDate}`)}
                  >
                    Finish planning
                  </Button>
                </div>
              ) : selectedSchedule.needsAttendance ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Generate attendance from the published schedule.</p>
                  {canEdit ? (
                    <Button
                      type="button"
                      className="w-full"
                      disabled={convertingScheduleId === selectedSchedule.id}
                      onClick={() => void convertScheduleToAttendance(selectedSchedule.id)}
                    >
                      {convertingScheduleId === selectedSchedule.id ? 'Generating…' : 'Generate attendance'}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      router.push(`/hr/attendance/create?workDate=${encodeURIComponent(workDate)}`)
                    }
                  >
                    Open manual sheet
                  </Button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Open the saved rows to review or correct the day.</p>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() =>
                      router.push(`/hr/attendance/create?workDate=${encodeURIComponent(workDate)}`)
                    }
                  >
                    Review rows
                  </Button>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full"
                      disabled={deletingDate === workDate}
                      onClick={() => void deleteAttendanceByDate(workDate)}
                    >
                      {deletingDate === workDate ? 'Deleting…' : 'Clear this day'}
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title="Pending days"
          description="Published schedules that still need attendance rows."
        >
          <div className="space-y-3">
            {!overview ? (
              <EmptyState message="Loading pending days..." />
            ) : overview.pendingSchedules.length === 0 ? (
              <EmptyState message="No pending published schedules." tone="emerald" />
            ) : (
              overview.pendingSchedules.map((pending) => {
                const dateYmd = String(pending.workDate).slice(0, 10);
                return (
                  <div key={pending.id} className="rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{formatDateLabel(dateYmd)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {pending.assignmentCount} assignment groups
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => router.push(`/hr/schedule/${dateYmd}`)}
                        >
                          Open
                        </Button>
                        {canEdit ? (
                          <Button
                            size="sm"
                            type="button"
                            disabled={convertingScheduleId === pending.id}
                            onClick={() => void convertScheduleToAttendance(pending.id)}
                          >
                            {convertingScheduleId === pending.id ? 'Generating…' : 'Generate'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>
      </section>

      <Panel
        title="Recent attendance days"
        description="Fast access to days that were already saved and may need follow-up changes."
        action={
          canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(`/hr/attendance/create?workDate=${encodeURIComponent(workDate)}`)
              }
            >
              Open current day
            </Button>
          ) : null
        }
      >
        <div className="space-y-3">
          {loading ? (
            <EmptyState message="Loading recent attendance days..." />
          ) : !overview || overview.previousAttendanceDays.length === 0 ? (
            <EmptyState message="No previous attendance entries found." />
          ) : (
            overview.previousAttendanceDays.map((day) => {
              const dateYmd = String(day.workDate).slice(0, 10);
              return (
                <div key={dateYmd} className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{formatDateLabel(dateYmd)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{day.rows} rows saved</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        onClick={() =>
                          router.push(`/hr/attendance/create?workDate=${encodeURIComponent(dateYmd)}`)
                        }
                      >
                        Edit
                      </Button>
                      {canEdit ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          type="button"
                          disabled={deletingDate === dateYmd}
                          onClick={() => void deleteAttendanceByDate(dateYmd)}
                        >
                          {deletingDate === dateYmd ? 'Deleting…' : 'Delete'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}
