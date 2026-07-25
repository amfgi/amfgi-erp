import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { companyIdWhere, requireHrSession } from '@/lib/hr/requireHrSession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

/** Legacy endpoint — attendance rows are created only when saving the day sheet. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_ATTENDANCE_EDIT });
  if (!ctx.ok) return ctx.response;
  const { companyIds } = ctx;
  const { id } = await params;

  const sch = await prisma.workSchedule.findFirst({
    where: { id, ...companyIdWhere(companyIds) },
    select: { id: true, status: true, workDate: true },
  });
  if (!sch) return errorResponse('Not found', 404);
  if (sch.status !== 'PUBLISHED') return errorResponse('Schedule must be published', 400);

  return successResponse({
    ok: true,
    workDate: sch.workDate,
    message: 'Open the attendance day sheet and save to create rows. This endpoint no longer writes attendance automatically.',
  });
}
