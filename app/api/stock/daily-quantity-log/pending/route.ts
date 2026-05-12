import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { ymdFromInput } from '@/lib/hr/workDate';
import { P } from '@/lib/permissions';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

/** Schedules that have site jobs assigned but no finalized quantity log yet. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_VIEW)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 120);

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
        title: true,
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

  const pending = schedules
    .filter((sch) => !finalized.has(sch.workDate.toISOString().slice(0, 10)))
    .map((sch) => ({
      scheduleId: sch.id,
      workDate: sch.workDate.toISOString().slice(0, 10),
      title: sch.title,
      status: sch.status,
      clientDisplayName: sch.clientDisplayName,
      assignmentCount: sch.assignments.length,
    }));

  const recentFinalized = await prisma.quantityLogDaySubmission.findMany({
    where: { companyId },
    orderBy: { workDate: 'desc' },
    take: 120,
    select: {
      workDate: true,
      submittedAt: true,
    },
  });

  return successResponse({
    pending,
    recentFinalized: recentFinalized.map((row) => ({
      workDate: row.workDate.toISOString().slice(0, 10),
      submittedAt: row.submittedAt,
    })),
  });
}
