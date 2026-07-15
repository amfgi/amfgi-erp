import { prisma } from '@/lib/db/prisma';
import { checkEmployeeDeleteEligibility } from '@/lib/hr/checkEmployeeDeleteEligibility';
import { P } from '@/lib/permissions';
import { hasPerm, requireCompanySession } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!hasPerm(session.user, P.HR_EMPLOYEE_VIEW) && !hasPerm(session.user, P.HR_EMPLOYEE_DELETE)) {
    return errorResponse('Forbidden', 403);
  }
  const { id } = await params;

  try {
    const result = await checkEmployeeDeleteEligibility(prisma, companyId, id);
    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to check employee';
    if (message.includes('not found')) return errorResponse('Employee not found', 404);
    return errorResponse(message, 500);
  }
}
