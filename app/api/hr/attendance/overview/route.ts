import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

function monthBounds(monthYmd: string) {
  const [y, m] = monthYmd.split('-').map((x) => Number(x));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

function parseMonthParam(raw: string | null): string {
  if (!raw?.trim()) throw new Error('empty');
  const normalized = raw.trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error('format');
  const [, m] = normalized.split('-').map(Number);
  if (m < 1 || m > 12) throw new Error('range');
  return normalized;
}

function currentMonthYmd() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

const pendingScheduleInMonthSql = (companyId: string, start: Date, end: Date) => Prisma.sql`
  FROM "WorkSchedule" ws
  WHERE ws."companyId" = ${companyId}
    AND ws.status = 'PUBLISHED'::"WorkScheduleStatus"
    AND ws."workDate" >= ${start}
    AND ws."workDate" < ${end}
    AND NOT EXISTS (
      SELECT 1 FROM "AttendanceEntry" ae
      WHERE ae."companyId" = ws."companyId"
        AND ae."workDate" = ws."workDate"
    )
`;

type OverviewDayRow = {
  workDate: Date;
  kind: 'pending' | 'saved';
  scheduleId: string | null;
  assignmentCount: number;
  attendanceRows: number;
};

async function loadOverviewDaysForMonth(
  companyId: string,
  start: Date,
  end: Date,
): Promise<OverviewDayRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      workDate: Date;
      kind: string;
      scheduleId: string | null;
      assignmentCount: bigint;
      attendanceRows: bigint;
    }>
  >(
    Prisma.sql`
      SELECT
        combined."workDate",
        combined.kind,
        combined."scheduleId",
        combined."assignmentCount",
        combined."attendanceRows"
      FROM (
        SELECT
          ws."workDate" AS "workDate",
          'pending'::text AS kind,
          ws.id AS "scheduleId",
          (
            SELECT COUNT(*)::bigint
            FROM "WorkAssignment" wa
            WHERE wa."companyId" = ws."companyId"
              AND wa."workScheduleId" = ws.id
          ) AS "assignmentCount",
          0::bigint AS "attendanceRows"
        ${pendingScheduleInMonthSql(companyId, start, end)}
        UNION ALL
        SELECT
          ae."workDate" AS "workDate",
          'saved'::text AS kind,
          NULL::text AS "scheduleId",
          0::bigint AS "assignmentCount",
          COUNT(*)::bigint AS "attendanceRows"
        FROM "AttendanceEntry" ae
        WHERE ae."companyId" = ${companyId}
          AND ae."workDate" >= ${start}
          AND ae."workDate" < ${end}
        GROUP BY ae."workDate"
      ) AS combined
      ORDER BY combined."workDate" DESC
    `,
  );

  return rows.map((row) => ({
    workDate: row.workDate,
    kind: row.kind === 'pending' ? 'pending' : 'saved',
    scheduleId: row.scheduleId,
    assignmentCount: Number(row.assignmentCount),
    attendanceRows: Number(row.attendanceRows),
  }));
}

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_ATTENDANCE_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const monthRaw =
    searchParams.get('month') ?? searchParams.get('workDate')?.trim().slice(0, 7) ?? currentMonthYmd();

  let monthYmd: string;
  try {
    monthYmd = parseMonthParam(monthRaw);
  } catch {
    return errorResponse('month query required (YYYY-MM)', 400);
  }

  const { start, end } = monthBounds(monthYmd);

  const [publishedSchedules, attendanceRowsInMonth, days] = await Promise.all([
    prisma.workSchedule.findMany({
      where: { companyId, status: 'PUBLISHED', workDate: { gte: start, lt: end } },
      select: { id: true, workDate: true, _count: { select: { assignments: true } } },
      orderBy: { workDate: 'asc' },
    }),
    prisma.attendanceEntry.groupBy({
      by: ['workDate'],
      where: { companyId, workDate: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    loadOverviewDaysForMonth(companyId, start, end),
  ]);

  const attendanceCountByDate = new Map(
    attendanceRowsInMonth.map((r) => [r.workDate.toISOString().slice(0, 10), r._count._all]),
  );
  const fulfilledScheduleDays = publishedSchedules.filter(
    (s) => (attendanceCountByDate.get(s.workDate.toISOString().slice(0, 10)) ?? 0) > 0,
  ).length;

  return successResponse({
    month: monthYmd,
    monthStats: {
      month: monthYmd,
      publishedScheduleDays: publishedSchedules.length,
      fulfilledScheduleDays,
      pendingScheduleDays: Math.max(0, publishedSchedules.length - fulfilledScheduleDays),
      attendanceRowCount: attendanceRowsInMonth.reduce((sum, x) => sum + x._count._all, 0),
    },
    days: days.map((day) => ({
      workDate: day.workDate,
      kind: day.kind,
      scheduleId: day.scheduleId,
      assignmentCount: day.assignmentCount,
      attendanceRows: day.attendanceRows,
    })),
  });
}
