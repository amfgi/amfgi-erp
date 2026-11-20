import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { listSalesRevisions } from '@/lib/sales/service';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    return successResponse(await listSalesRevisions(session.companyId, id, session.access));
  } catch (error) {
    return salesErrorResponse(error);
  }
}
