import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { companyIdWhere, requireHrSession } from '@/lib/hr/requireHrSession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_SCHEDULE_PUBLISH });
  if (!ctx.ok) return ctx.response;
  const { companyIds } = ctx;
  const { id } = await params;

  const sch = await prisma.workSchedule.findFirst({
    where: { id, ...companyIdWhere(companyIds) },
    select: { id: true, companyId: true, status: true },
  });
  if (!sch) return errorResponse('Not found', 404);
  if (sch.status !== 'PUBLISHED') return errorResponse('Only published schedules can be locked', 400);
  const companyId = sch.companyId;

  const updated = await prisma.workSchedule.update({
    where: { id },
    data: {
      status: 'LOCKED',
      lockedAt: new Date(),
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
