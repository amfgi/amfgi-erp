import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { forwardToQuotation } from '@/lib/sales/service';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    return successResponse(await forwardToQuotation(session.companyId, id, session.access));
  } catch (error) {
    return salesErrorResponse(error);
  }
}
