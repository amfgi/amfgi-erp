import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import {
  basicHoursForProfileExtension,
  employeeTypeFromProfileExtension,
  readEmployeeTypeSettingsFromCompanyData,
} from '@/lib/hr/employeeTypeSettings';

const attendanceEntryInclude = {
  employee: {
    select: {
      id: true,
      fullName: true,
      preferredName: true,
      employeeCode: true,
      status: true,
      profileExtension: true,
    },
  },
  workAssignment: {
    select: {
      id: true,
      label: true,
      jobNumberSnapshot: true,
      siteNameSnapshot: true,
      clientNameSnapshot: true,
      projectDetailsSnapshot: true,
      factoryCode: true,
      shiftStart: true,
      shiftEnd: true,
      breakWindow: true,
      locationType: true,
      job: {
        select: {
          id: true,
          jobNumber: true,
          site: true,
          projectName: true,
          projectDetails: true,
          customer: {
            select: { name: true },
          },
        },
      },
    },
  },
} satisfies Prisma.AttendanceEntryInclude;

type AttendanceEntryRow = Prisma.AttendanceEntryGetPayload<{ include: typeof attendanceEntryInclude }>;

function serializeAttendanceRow(
  row: AttendanceEntryRow,
  typeSettings: ReturnType<typeof readEmployeeTypeSettingsFromCompanyData>,
) {
  const snapshottedBasicHours = Number(row.basicHours);
  return {
    ...row,
    basicHours: snapshottedBasicHours,
    employee: {
      ...row.employee,
      status: (row.employee as { status?: string }).status ?? 'ACTIVE',
      employeeType: employeeTypeFromProfileExtension(row.employee.profileExtension),
      basicHoursPerDay: Number.isFinite(snapshottedBasicHours)
        ? snapshottedBasicHours
        : basicHoursForProfileExtension(row.employee.profileExtension, typeSettings),
      defaultTiming: (() => {
        const employeeType = employeeTypeFromProfileExtension(row.employee.profileExtension);
        const timing = typeSettings[employeeType];
        return timing
          ? {
              dutyStart: timing.dutyStart,
              dutyEnd: timing.dutyEnd,
              breakStart: timing.breakStart,
              breakEnd: timing.breakEnd,
            }
          : null;
      })(),
    },
    workAssignment: row.workAssignment
      ? {
          ...row.workAssignment,
          costingSnapshot: {
            jobNumber: row.workAssignment.jobNumberSnapshot || row.workAssignment.job?.jobNumber || null,
            siteName: row.workAssignment.siteNameSnapshot || row.workAssignment.job?.site || null,
            customerName: row.workAssignment.clientNameSnapshot || row.workAssignment.job?.customer?.name || null,
            projectName: row.workAssignment.job?.projectName || null,
            projectDetails:
              row.workAssignment.projectDetailsSnapshot || row.workAssignment.job?.projectDetails || null,
          },
        }
      : null,
  };
}

function monthBoundsYmd(monthYmd: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}$/.test(monthYmd)) throw new Error('Invalid month YYYY-MM');
  const [y, m] = monthYmd.split('-').map(Number);
  const start = dateFromYmd(`${monthYmd}-01`);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = dateFromYmd(`${monthYmd}-${String(lastDay).padStart(2, '0')}`);
  return { start, end };
}

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_ATTENDANCE_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get('employeeId')?.trim() ?? '';
  const monthRaw = searchParams.get('month')?.trim().slice(0, 7) ?? '';
  const workDateRaw = searchParams.get('workDate');

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { hrEmployeeTypeSettings: true, printTemplates: true },
    });
    const typeSettings = readEmployeeTypeSettingsFromCompanyData(company);

    if (employeeId && monthRaw) {
      if (!/^\d{4}-\d{2}$/.test(monthRaw)) return errorResponse('Invalid month (YYYY-MM)', 400);
      let start: Date;
      let end: Date;
      try {
        ({ start, end } = monthBoundsYmd(monthRaw));
      } catch {
        return errorResponse('Invalid month (YYYY-MM)', 400);
      }

      const employee = await prisma.employee.findFirst({
        where: { companyId, id: employeeId },
        select: { id: true },
      });
      if (!employee) return errorResponse('Employee not found', 404);

      const rows = await prisma.attendanceEntry.findMany({
        where: { companyId, employeeId, workDate: { gte: start, lte: end } },
        include: attendanceEntryInclude,
        orderBy: [{ workDate: 'asc' }],
      });

      return successResponse({
        month: monthRaw,
        employeeId,
        items: rows.map((row) => serializeAttendanceRow(row, typeSettings)),
      });
    }

    if (!workDateRaw) {
      return errorResponse('workDate (YYYY-MM-DD) or employeeId+month (YYYY-MM) query required', 400);
    }

    let workDateYmd: string;
    try {
      workDateYmd = ymdFromInput(workDateRaw);
    } catch {
      return errorResponse('Invalid workDate', 400);
    }
    const workDate = dateFromYmd(workDateYmd);
    const limitParam = searchParams.get('limit');
    const where = { companyId, workDate };

    if (limitParam !== null) {
      const limit = parseListLimit(limitParam);
      const offset = parseListOffset(searchParams.get('offset'));
      const search = searchParams.get('search')?.trim() ?? '';

      const searchWhere: Prisma.AttendanceEntryWhereInput = search
        ? {
            ...where,
            OR: [
              { employee: { fullName: { contains: search, mode: 'insensitive' } } },
              { employee: { preferredName: { contains: search, mode: 'insensitive' } } },
              { employee: { employeeCode: { contains: search, mode: 'insensitive' } } },
              { workAssignment: { jobNumberSnapshot: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : where;

      const [total, rows] = await Promise.all([
        prisma.attendanceEntry.count({ where: searchWhere }),
        prisma.attendanceEntry.findMany({
          where: searchWhere,
          include: attendanceEntryInclude,
          orderBy: [{ employee: { fullName: 'asc' } }],
          skip: offset,
          take: limit,
        }),
      ]);

      return successResponse({
        items: rows.map((row) => serializeAttendanceRow(row, typeSettings)),
        total,
      });
    }

    const rows = await prisma.attendanceEntry.findMany({
      where,
      include: attendanceEntryInclude,
      orderBy: [{ employee: { fullName: 'asc' } }],
    });

    return successResponse(rows.map((row) => serializeAttendanceRow(row, typeSettings)));
  } catch {
    return errorResponse('Failed to fetch attendance', 500);
  }
}

export async function DELETE(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_ATTENDANCE_EDIT)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const workDateRaw = searchParams.get('workDate');
  if (!workDateRaw) return errorResponse('workDate query required (YYYY-MM-DD)', 400);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(workDateRaw);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }
  const workDate = dateFromYmd(workDateYmd);

  const result = await prisma.attendanceEntry.deleteMany({
    where: { companyId, workDate },
  });
  publishLiveUpdate({
    companyId,
    channel: 'hr',
    entity: 'attendance',
    action: 'deleted',
  });
  return successResponse({ ok: true, deletedRows: result.count });
}
