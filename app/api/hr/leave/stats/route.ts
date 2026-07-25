import { prisma } from '@/lib/db/prisma';
import { getLeaveManagementStats } from '@/lib/hr/leaveRequestService';
import { P } from '@/lib/permissions';
import { requireHrSession, resolveHrWriteCompanyId } from '@/lib/hr/requireHrSession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const permOrder = [
    P.HR_LEAVE_VIEW,
    P.HR_LEAVE_APPROVE,
    P.HR_LEAVE_EDIT,
    P.HR_LEAVE_DELETE,
  ];

  let ctx: Awaited<ReturnType<typeof requireHrSession>> | null = null;
  for (const permission of permOrder) {
    const attempt = await requireHrSession({
      permission,
      companyId: searchParams.get('companyId'),
    });
    ctx = attempt;
    if (attempt.ok) break;
  }
  if (!ctx?.ok) return ctx?.response ?? errorResponse('Forbidden', 403);

  let companyId = ctx.companyId;
  if (!companyId) {
    companyId = resolveHrWriteCompanyId({
      requestedCompanyId: searchParams.get('companyId'),
      activeCompanyId: ctx.session.user.activeCompanyId,
    });
  }
  if (!companyId || !ctx.companyIds.includes(companyId)) {
    return errorResponse('companyId is required', 400);
  }

  const stats = await getLeaveManagementStats(prisma, companyId);
  return successResponse(stats);
}
