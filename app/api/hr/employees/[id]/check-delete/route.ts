import { prisma } from '@/lib/db/prisma';
import { checkEmployeeDeleteEligibility } from '@/lib/hr/checkEmployeeDeleteEligibility';
import { P } from '@/lib/permissions';
import { companyIdWhere, hasPerm, requireHrSession } from '@/lib/hr/requireHrSession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx: Awaited<ReturnType<typeof requireHrSession>> | null = null;
  for (const permission of [P.HR_EMPLOYEE_VIEW, P.HR_EMPLOYEE_DELETE]) {
    const attempt = await requireHrSession({ permission });
    ctx = attempt;
    if (attempt.ok) break;
  }
  if (!ctx?.ok) return ctx?.response ?? errorResponse('Forbidden', 403);
  const { session, companyIds } = ctx;
  if (!hasPerm(session.user, P.HR_EMPLOYEE_VIEW) && !hasPerm(session.user, P.HR_EMPLOYEE_DELETE)) {
    return errorResponse('Forbidden', 403);
  }
  const { id } = await params;

  const emp = await prisma.employee.findFirst({
    where: { id, ...companyIdWhere(companyIds) },
  });
  if (!emp) return errorResponse('Employee not found', 404);
  const companyId = emp.companyId;

  try {
    const result = await checkEmployeeDeleteEligibility(prisma, companyId, id);
    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to check employee';
    if (message.includes('not found')) return errorResponse('Employee not found', 404);
    return errorResponse(message, 500);
  }
}
