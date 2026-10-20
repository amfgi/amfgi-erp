import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { reviseQuotation } from '@/lib/sales/service';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    return successResponse(await reviseQuotation(session.companyId, id, session.access));
  } catch (error) {
    return salesErrorResponse(error);
  }
}
