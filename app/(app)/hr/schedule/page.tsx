'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import { cn } from '@/lib/utils';
import { useGetHrSchedulesQuery } from '@/store/api/endpoints/hr';

async function readApiEnvelope<T>(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as { success?: boolean; data?: T; error?: string };
  } catch {
    return null;
  }
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'emerald' | 'amber';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-foreground';

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('mt-2 text-2xl font-semibold tabular-nums', toneClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function workflowBadgeClasses(row: {
  status: string;
  attendanceRows: number;
  workDate: string;
}) {
  const attendanceReady = row.attendanceRows > 0;
  if (row.status === 'LOCKED') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300';
  }
  if (row.status === 'PUBLISHED') {
    return attendanceReady
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
      : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300';
  }
  return 'border-border bg-muted/50 text-muted-foreground';
}

export default function HrScheduleListPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [creating, setCreating] = useState(false);
  const [newDate, setNewDate] = useState(todayYmd);
  const [search, setSearch] = useState('');

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.schedule.view');
  const canEdit = isSA || perms.includes('hr.schedule.edit');

  const { data: rows = [], isLoading: loading } = useGetHrSchedulesQuery(undefined, {
    skip: !canView,
  });

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.workDate, row.status]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const summary = useMemo(() => {
    const today = todayYmd();
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === 'DRAFT') acc.draft += 1;
        if (row.status === 'PUBLISHED') acc.published += 1;
        if (row.status === 'LOCKED') acc.locked += 1;
        if (row.status === 'PUBLISHED' && row.attendanceRows === 0 && row.workDate.slice(0, 10) <= today) {
          acc.pendingAttendance += 1;
        }
        return acc;
      },
      { total: 0, draft: 0, published: 0, locked: 0, pendingAttendance: 0 },
    );
  }, [rows]);

  const createSchedule = async () => {
    if (!newDate) return;
    setCreating(true);
    const res = await fetch('/api/hr/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDate: newDate }),
    });
    const json = await readApiEnvelope<{ id: string; workDate: string }>(res);
    setCreating(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to create schedule');
      return;
    }
    toast.success('Schedule draft created');
    router.push(`/hr/schedule/${newDate}`);
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to view HR schedules.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <div className="h-24 animate-pulse rounded-lg border border-border bg-muted/30" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted/30" />
          ))}
        </div>
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Date', 'Workflow', 'Teams', 'Absences', 'Attendance', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground first:pl-5 last:pr-5"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableSkeleton rows={6} columns={6} />
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="w-full min-w-0 space-y-6 border-b border-border pb-4">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HR planning</p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Schedule planning</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Create the day schedule, assign teams and drivers, then hand it off cleanly into attendance.
            </p>
          </div>

          {canEdit ? (
            <Card className="w-full shrink-0 lg:max-w-sm">
              <CardContent className="space-y-4 p-4">
                <div className="space-y-2">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Work date
                  </span>
                  <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button type="button" variant="ghost" size="sm" className="h-auto px-0 text-xs" onClick={() => setNewDate(todayYmd())}>
                    Use today
                  </Button>
                  <Button type="button" disabled={creating || !newDate} size="sm" onClick={() => void createSchedule()}>
                    {creating ? 'Creating…' : 'Create schedule draft'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total schedules" value={summary.total} />
          <StatCard label="Drafts" value={summary.draft} />
          <StatCard label="Published" value={summary.published} tone="emerald" />
          <StatCard label="Locked" value={summary.locked} />
          <StatCard label="Needs attendance" value={summary.pendingAttendance} tone="amber" />
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Schedule register</h2>
            <p className="text-sm text-muted-foreground">
              Recent days with planning progress and attendance handoff status.
            </p>
          </div>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by date or status"
            className="lg:max-w-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Date</th>
                <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Workflow</th>
                <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Teams</th>
                <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Absences</th>
                <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Attendance</th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-muted-foreground">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                    No schedules match the current filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const workDateYmd = row.workDate.slice(0, 10);
                  const attendanceReady = row.attendanceRows > 0;
                  const workflowLabel =
                    row.status === 'LOCKED'
                      ? 'Locked'
                      : row.status === 'PUBLISHED'
                        ? attendanceReady
                          ? 'Published and handed to attendance'
                          : 'Published, waiting for attendance'
                        : 'Draft planning in progress';

                  return (
                    <tr key={row.id} className="transition-colors hover:bg-muted/40">
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => router.push(`/hr/schedule/${workDateYmd}`)}
                          className="text-left"
                        >
                          <p className="font-medium text-foreground">{formatDateLabel(row.workDate)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{workDateYmd}</p>
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="outline" className={cn('font-medium', workflowBadgeClasses(row))}>
                          {row.status}
                        </Badge>
                        <p className="mt-2 text-xs text-muted-foreground">{workflowLabel}</p>
                      </td>
                      <td className="px-5 py-4">{row._count.assignments}</td>
                      <td className="px-5 py-4">{row._count.absences}</td>
                      <td className="px-5 py-4">
                        <span
                          className={
                            attendanceReady
                              ? 'font-medium text-emerald-600 dark:text-emerald-300'
                              : 'font-medium text-amber-700 dark:text-amber-300'
                          }
                        >
                          {row.attendanceRows}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {attendanceReady ? 'Rows available' : 'Not generated yet'}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" type="button" onClick={() => router.push(`/hr/schedule/${workDateYmd}`)}>
                            Plan
                          </Button>
                          <Button
                            variant={attendanceReady ? 'secondary' : 'default'}
                            size="sm"
                            type="button"
                            onClick={() => router.push(`/hr/attendance?workDate=${encodeURIComponent(workDateYmd)}`)}
                          >
                            {attendanceReady ? 'Attendance' : 'Create attendance'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
