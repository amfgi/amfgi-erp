import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { requireHrSession, resolveHrWriteCompanyId } from '@/lib/hr/requireHrSession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const BodySchema = z.object({
  companyId: z.string().min(1).optional(),
  workDate: z.string().min(1),
  action: z.enum(['submit', 'approve']),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const ctx = await requireHrSession({
    permission:
      parsed.data.action === 'approve' ? P.HR_ATTENDANCE_APPROVE : P.HR_ATTENDANCE_EDIT,
  });
  if (!ctx.ok) return ctx.response;
  const { session } = ctx;

  const companyId = resolveHrWriteCompanyId({
    requestedCompanyId: parsed.data.companyId,
    activeCompanyId: ctx.session.user.activeCompanyId,
  });
  if (!companyId || !ctx.companyIds.includes(companyId)) {
    return errorResponse('companyId is required', 400);
  }

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(parsed.data.workDate);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }
  const workDate = dateFromYmd(workDateYmd);

  if (parsed.data.action === 'submit') {
    const result = await prisma.attendanceEntry.updateMany({
      where: { companyId, workDate, workflowStatus: 'DRAFT' },
      data: { workflowStatus: 'SUBMITTED' },
    });
    return successResponse({ updated: result.count });
  }

  const result = await prisma.attendanceEntry.updateMany({
    where: {
      companyId,
      workDate,
      workflowStatus: { in: ['DRAFT', 'SUBMITTED'] },
    },
    data: {
      workflowStatus: 'APPROVED',
      approvedAt: new Date(),
      approvedById: session.user.id,
    },
  });
  return successResponse({ updated: result.count });
}
