import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { checkJobDeleteEligibility } from '@/lib/jobs/checkJobDeleteEligibility';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id } = await params;

  try {
    const result = await checkJobDeleteEligibility(prisma, companyId, id);
    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to check job';
    if (message.includes('not found')) return errorResponse('Job not found', 404);
    return errorResponse(message, 500);
  }
}
