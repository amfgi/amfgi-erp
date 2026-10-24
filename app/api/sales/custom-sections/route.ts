import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { createCustomSection, listCustomSections } from '@/lib/sales/customSections';
import { SalesError } from '@/lib/sales/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationView && !session.access.quotationManage) throw new SalesError('Forbidden', 403);
    return successResponse(await listCustomSections(session.companyId));
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationManage) throw new SalesError('Forbidden', 403);
    const body = (await req.json()) as { name?: unknown; content?: unknown };
    const name = typeof body.name === 'string' ? body.name : '';
    const created = await createCustomSection(session.companyId, name, body.content);
    return successResponse(created, 201);
  } catch (error) {
    return salesErrorResponse(error);
  }
}
