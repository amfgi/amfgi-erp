import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { buildDailyQuantityLogPayload } from '@/lib/stock/buildDailyQuantityLog';
import { P } from '@/lib/permissions';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { ymdFromInput } from '@/lib/hr/workDate';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_VIEW)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { searchParams } = new URL(req.url);
  const workDateRaw = searchParams.get('workDate');
  if (!workDateRaw) return errorResponse('workDate is required', 400);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(workDateRaw);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }

  const payload = await buildDailyQuantityLogPayload(prisma, companyId, workDateYmd);
  return successResponse(payload);
}
