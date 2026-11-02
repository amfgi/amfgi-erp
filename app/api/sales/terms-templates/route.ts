import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { createTermsTemplate, listTermsTemplates } from '@/lib/sales/termsTemplates';
import { SalesError } from '@/lib/sales/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationView && !session.access.quotationManage) throw new SalesError('Forbidden', 403);
    return successResponse(await listTermsTemplates(session.companyId));
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationManage) throw new SalesError('Forbidden', 403);
    const body = (await req.json()) as { name?: unknown; rows?: unknown };
    const name = typeof body.name === 'string' ? body.name : '';
    const created = await createTermsTemplate(session.companyId, name, body.rows);
    return successResponse(created, 201);
  } catch (error) {
    return salesErrorResponse(error);
  }
}
