import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const scheduleDetailSelect = {
  id: true,
  companyId: true,
  workDate: true,
  clientDisplayName: true,
  notes: true,
  status: true,
  publishedAt: true,
  lockedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  assignments: {
    orderBy: { columnIndex: 'asc' as const },
    include: {
      members: { include: { employee: { select: { id: true, fullName: true, employeeCode: true } } } },
      job: {
        select: {
          id: true,
          jobNumber: true,
          site: true,
          description: true,
          projectDetails: true,
          customer: { select: { name: true } },
        },
      },
      teamLeader: { select: { id: true, fullName: true } },
      driver1: { select: { id: true, fullName: true } },
      driver2: { select: { id: true, fullName: true } },
    },
  },
  absences: { include: { employee: { select: { id: true, fullName: true } } } },
  driverLogs: { orderBy: { sequence: 'asc' as const }, include: { driver: { select: { id: true, fullName: true } } } },
} as const;

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const workDateRaw = searchParams.get('workDate');

  if (!workDateRaw) {
    const limitParam = searchParams.get('limit');
    const offset = parseListOffset(searchParams.get('offset'));
    const q = searchParams.get('q')?.trim() ?? '';
    const status = searchParams.get('status');
    const monthRaw = searchParams.get('month')?.trim().slice(0, 7) ?? '';

    const where: Prisma.WorkScheduleWhereInput = { companyId };
    if (status && status !== 'ALL') {
      where.status = status as 'DRAFT' | 'PUBLISHED' | 'LOCKED';
    }
    if (q) {
      where.clientDisplayName = { contains: q, mode: 'insensitive' };
    }
    if (/^\d{4}-\d{2}$/.test(monthRaw)) {
      const [y, m] = monthRaw.split('-').map((x) => Number(x));
      if (m >= 1 && m <= 12) {
        where.workDate = {
          gte: new Date(Date.UTC(y, m - 1, 1)),
          lt: new Date(Date.UTC(y, m, 1)),
        };
      }
    }

    const mapRow = async (rows: Array<{
      id: string;
      workDate: Date;
      status: string;
      clientDisplayName: string | null;
      createdAt: Date;
      publishedAt: Date | null;
      lockedAt: Date | null;
      _count: { assignments: number; absences: number };
    }>) => {
      const attendanceByDate = new Map<string, number>();
      if (rows.length > 0) {
        const attendanceRows = await prisma.attendanceEntry.groupBy({
          by: ['workDate'],
          where: {
            companyId,
            workDate: { in: rows.map((row) => row.workDate) },
          },
          _count: { _all: true },
        });
        for (const row of attendanceRows) {
          attendanceByDate.set(row.workDate.toISOString().slice(0, 10), row._count._all);
        }
      }
      return rows.map((row) => ({
        ...row,
        attendanceRows: attendanceByDate.get(row.workDate.toISOString().slice(0, 10)) ?? 0,
      }));
    };

    if (/^\d{4}-\d{2}$/.test(monthRaw)) {
      const rows = await prisma.workSchedule.findMany({
        where,
        orderBy: { workDate: 'desc' },
        select: {
          id: true,
          workDate: true,
          status: true,
          clientDisplayName: true,
          createdAt: true,
          publishedAt: true,
          lockedAt: true,
          _count: { select: { assignments: true, absences: true } },
        },
      });
      return successResponse(await mapRow(rows));
    }

    if (limitParam !== null) {
      const limit = parseListLimit(limitParam);
      const [total, rows] = await Promise.all([
        prisma.workSchedule.count({ where }),
        prisma.workSchedule.findMany({
          where,
          orderBy: { workDate: 'desc' },
          select: {
            id: true,
            workDate: true,
            status: true,
            clientDisplayName: true,
            createdAt: true,
            publishedAt: true,
            lockedAt: true,
            _count: { select: { assignments: true, absences: true } },
          },
          skip: offset,
          take: limit,
        }),
      ]);
      return successResponse({ items: await mapRow(rows), total });
    }

    const rows = await prisma.workSchedule.findMany({
      where,
      orderBy: { workDate: 'desc' },
      select: {
        id: true,
        workDate: true,
        status: true,
        clientDisplayName: true,
        createdAt: true,
        publishedAt: true,
        lockedAt: true,
        _count: { select: { assignments: true, absences: true } },
      },
      take: 500,
    });
    return successResponse(await mapRow(rows));
  }

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(workDateRaw);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }

  const sch = await prisma.workSchedule.findFirst({
    where: { companyId, workDate: dateFromYmd(workDateYmd) },
    select: scheduleDetailSelect,
  });
  return successResponse(sch);
}

const PostSchema = z.object({
  workDate: z.string().min(1),
  clientDisplayName: z.string().max(200).optional().nullable(),
});

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_EDIT)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(parsed.data.workDate);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }
  const workDate = dateFromYmd(workDateYmd);

  const existing = await prisma.workSchedule.findFirst({
    where: { companyId, workDate },
    select: { id: true },
  });
  if (existing) return errorResponse('Schedule already exists for this date', 409);

  const sch = await prisma.workSchedule.create({
    data: {
      companyId,
      workDate,
      clientDisplayName: parsed.data.clientDisplayName?.trim() || null,
      status: 'DRAFT',
      createdById: session.user.id,
    },
    select: scheduleDetailSelect,
  });
  publishLiveUpdate({
    companyId,
    channel: 'hr',
    entity: 'schedule',
    action: 'created',
  });
  return successResponse(sch, 201);
}
