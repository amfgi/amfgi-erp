import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(_req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const companyId = session.user.activeCompanyId;
    const agg = await prisma.deliveryNote.aggregate({
      where: { companyId },
      _max: { number: true },
    });
    const nextNumber = (agg._max.number ?? 0) + 1;

    return successResponse({ nextNumber });
  } catch (err: unknown) {
    console.error('Error getting next delivery note number:', err);
    return errorResponse('Failed to get delivery note number', 500);
  }
}
