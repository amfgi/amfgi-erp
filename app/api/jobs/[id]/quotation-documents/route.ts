import { auth } from '@/auth';
import { listCarriedQuotationDocumentsForJob } from '@/lib/sales/quotationDocuments';
import { canViewJobDetailForHrPicker } from '@/lib/permissions/stockModuleAccess';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canViewJobDetailForHrPicker(session.user.permissions, session.user.isSuperAdmin ?? false)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const { id } = await params;
  return successResponse(await listCarriedQuotationDocumentsForJob(session.user.activeCompanyId, id));
}
