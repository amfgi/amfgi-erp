import { auth } from '@/auth';

import { prisma } from '@/lib/db/prisma';
import { errorResponse } from '@/lib/utils/apiResponse';

import { salesAccess, type SalesAccess } from './access';
import { ensureSalesPipelineRoles } from './roles';
import { SalesError } from './service';

export async function requireSalesSession(): Promise<{
  userId: string;
  companyId: string;
  access: SalesAccess;
}> {
  const session = await auth();
  if (!session?.user) throw new SalesError('Unauthorized', 401);
  if (!session.user.activeCompanyId) throw new SalesError('No active company selected', 400);
  await ensureSalesPipelineRoles(prisma);
  return {
    userId: session.user.id,
    companyId: session.user.activeCompanyId,
    access: salesAccess(session.user),
  };
}

export function salesErrorResponse(error: unknown) {
  if (error instanceof SalesError) return errorResponse(error.message, error.status);
  console.error(error);
  return errorResponse('Something went wrong', 500);
}
