import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { createQuotationTemplate, listQuotationTemplates } from '@/lib/sales/quotationTemplates';
import { SalesError } from '@/lib/sales/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationView && !session.access.quotationManage) throw new SalesError('Forbidden', 403);
    return successResponse(await listQuotationTemplates(session.companyId));
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationManage) throw new SalesError('Forbidden', 403);
    const body = (await request.json()) as { name?: unknown; document?: unknown };
    const name = typeof body.name === 'string' ? body.name : '';
    const created = await createQuotationTemplate(session.companyId, name, body.document);
    return successResponse(created, 201);
  } catch (error) {
    return salesErrorResponse(error);
  }
}
