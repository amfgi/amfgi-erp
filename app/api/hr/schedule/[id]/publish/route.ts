import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import {
  dbAssignmentToValidationDraft,
  validateScheduleForPublish,
} from '@/lib/hr/schedulePublishValidation';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_PUBLISH)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  let acknowledgeLowHours = false;
  try {
    const body = (await req.json()) as { acknowledgeLowHours?: unknown };
    acknowledgeLowHours = body?.acknowledgeLowHours === true;
  } catch {
    // Empty body is fine.
  }

  const sch = await prisma.workSchedule.findFirst({
    where: { id, companyId },
    select: { id: true, status: true },
  });
  if (!sch) return errorResponse('Not found', 404);
  if (sch.status !== 'DRAFT') return errorResponse('Only draft schedules can be published', 400);

  const assignments = await prisma.workAssignment.findMany({
    where: { workScheduleId: id },
    orderBy: { columnIndex: 'asc' },
    select: {
      label: true,
      jobId: true,
      shiftStart: true,
      shiftEnd: true,
      breakWindow: true,
      members: { select: { employeeId: true } },
    },
  });

  const validationDrafts = assignments.map(dbAssignmentToValidationDraft);
  const validation = validateScheduleForPublish(validationDrafts);
  if (validation.blockingIssues.length > 0) {
    return errorResponse('Cannot publish schedule', 422, {
      code: 'PUBLISH_VALIDATION',
      blockingIssues: validation.blockingIssues,
    });
  }
  if (!acknowledgeLowHours && validation.lowHourTeams.length > 0) {
    return errorResponse('Short work hours', 422, {
      code: 'PUBLISH_LOW_HOURS',
      lowHourTeams: validation.lowHourTeams,
    });
  }

  const updated = await prisma.workSchedule.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
    select: {
      id: true,
      workDate: true,
      status: true,
      clientDisplayName: true,
      publishedAt: true,
      lockedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  publishLiveUpdate({
    companyId,
    channel: 'hr',
    entity: 'schedule',
    action: 'updated',
  });

  return successResponse(updated);
}
