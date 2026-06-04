import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { canViewProductionLogApi } from '@/lib/permissions/stockModuleAccess';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

const CUTOFF_DAYS = 120;

type RowStatus = 'PENDING' | 'FINALIZED';

type MergedRow = {
  workDate: string;
  status: RowStatus;
  scheduleId: string | null;
  clientDisplayName: string | null;
  assignmentCount: number | null;
  submittedAt: string | null;
};

function parseStatusFilter(raw: string | null): 'ALL' | RowStatus {
  if (raw === 'PENDING' || raw === 'FINALIZED') return raw;
  return 'ALL';
}

async function loadPendingRows(companyId: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CUTOFF_DAYS);

  const [schedules, submissions] = await Promise.all([
    prisma.workSchedule.findMany({
      where: {
        companyId,
        workDate: { gte: cutoff },
        assignments: { some: { jobId: { not: null } } },
      },
      orderBy: { workDate: 'asc' },
      select: {
        id: true,
        workDate: true,
        status: true,
        clientDisplayName: true,
        assignments: {
          where: { jobId: { not: null } },
          select: { id: true },
        },
      },
    }),
    prisma.quantityLogDaySubmission.findMany({
      where: { companyId },
      select: { workDate: true },
    }),
  ]);

  const finalized = new Set(submissions.map((row) => row.workDate.toISOString().slice(0, 10)));

  return schedules
    .filter((schedule) => !finalized.has(schedule.workDate.toISOString().slice(0, 10)))
    .map((schedule) => ({
      scheduleId: schedule.id,
      workDate: schedule.workDate.toISOString().slice(0, 10),
      status: schedule.status,
      clientDisplayName: schedule.clientDisplayName,
      assignmentCount: schedule.assignments.length,
    }));
}

async function loadFinalizedRows(companyId: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CUTOFF_DAYS);

  return prisma.quantityLogDaySubmission.findMany({
    where: { companyId, workDate: { gte: cutoff } },
    orderBy: { workDate: 'desc' },
    select: {
      workDate: true,
      submittedAt: true,
    },
  });
}

function toMergedRows(
  pending: Awaited<ReturnType<typeof loadPendingRows>>,
  finalized: Awaited<ReturnType<typeof loadFinalizedRows>>,
  status: 'ALL' | RowStatus,
): MergedRow[] {
  const pendingRows: MergedRow[] = pending.map((row) => ({
    workDate: row.workDate,
    status: 'PENDING',
    scheduleId: row.scheduleId,
    clientDisplayName: row.clientDisplayName,
    assignmentCount: row.assignmentCount,
    submittedAt: null,
  }));

  const finalizedRows: MergedRow[] = finalized.map((row) => ({
    workDate: row.workDate.toISOString().slice(0, 10),
    status: 'FINALIZED',
    scheduleId: null,
    clientDisplayName: null,
    assignmentCount: null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
  }));

  if (status === 'PENDING') {
    return pendingRows.sort((a, b) => (a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : 0));
  }
  if (status === 'FINALIZED') {
    return finalizedRows.sort((a, b) => (a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : 0));
  }

  return [...pendingRows, ...finalizedRows].sort((a, b) =>
    a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : 0,
  );
}

/** Schedules that have site jobs assigned but no finalized quantity log yet. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canViewProductionLogApi(session.user.permissions, session.user.isSuperAdmin)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');

  try {
    const [pending, finalized] = await Promise.all([
      loadPendingRows(companyId),
      loadFinalizedRows(companyId),
    ]);

    if (limitParam !== null) {
      const limit = parseListLimit(limitParam);
      const offset = parseListOffset(searchParams.get('offset'));
      const status = parseStatusFilter(searchParams.get('status'));
      const merged = toMergedRows(pending, finalized, status);
      const items = merged.slice(offset, offset + limit);

      return successResponse({
        items,
        total: merged.length,
        counts: {
          pending: pending.length,
          finalized: finalized.length,
          total: pending.length + finalized.length,
        },
        finalizedDates: finalized.map((row) => row.workDate.toISOString().slice(0, 10)),
      });
    }

    return successResponse({
      pending: pending.map((row) => ({
        scheduleId: row.scheduleId,
        workDate: row.workDate,
        status: row.status,
        clientDisplayName: row.clientDisplayName,
        assignmentCount: row.assignmentCount,
      })),
      recentFinalized: finalized.map((row) => ({
        workDate: row.workDate.toISOString().slice(0, 10),
        submittedAt: row.submittedAt,
      })),
    });
  } catch {
    return errorResponse('Failed to load production log days', 500);
  }
}
