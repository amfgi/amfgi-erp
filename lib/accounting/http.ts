import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { canManageAccounting } from '@/lib/accounting/access';
import { ensureAccountingDefaults } from '@/lib/accounting/defaults';
import { AccountingError } from '@/lib/accounting/service';
import { errorResponse } from '@/lib/utils/apiResponse';

export async function requireAccountingCompany() {
  const session = await auth();
  if (!session?.user) return { error: errorResponse('Unauthorized', 401) as Response };
  if (!canManageAccounting(session.user)) return { error: errorResponse('Forbidden', 403) };
  if (!session.user.activeCompanyId) return { error: errorResponse('No active company selected', 400) };
  await ensureAccountingDefaults(prisma, session.user.activeCompanyId);
  return { companyId: session.user.activeCompanyId, userId: session.user.id ?? null };
}

export function accountingErrorResponse(error: unknown) {
  if (error instanceof AccountingError) return errorResponse(error.message, error.status, error.code ? { code: error.code } : undefined);
  console.error('[accounting]', error);
  return errorResponse('Something went wrong while saving the books.', 500);
}
