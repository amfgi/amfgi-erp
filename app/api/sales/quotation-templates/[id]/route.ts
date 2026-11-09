import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { getQuotationTemplate } from '@/lib/sales/quotationTemplates';
import { SalesError } from '@/lib/sales/service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationView && !session.access.quotationManage) throw new SalesError('Forbidden', 403);
    const { id } = await params;
    return successResponse(await getQuotationTemplate(session.companyId, id));
  } catch (error) {
    return salesErrorResponse(error);
  }
}
