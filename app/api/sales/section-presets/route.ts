import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { createSectionPreset, listSectionPresets } from '@/lib/sales/sectionPresets';
import { SalesError } from '@/lib/sales/service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationView && !session.access.quotationManage) throw new SalesError('Forbidden', 403);
    const kind = new URL(req.url).searchParams.get('kind');
    return successResponse(await listSectionPresets(session.companyId, kind));
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationManage) throw new SalesError('Forbidden', 403);
    const body = (await req.json()) as { kind?: unknown; name?: unknown; body?: unknown; rows?: unknown };
    const name = typeof body.name === 'string' ? body.name : '';
    const created = await createSectionPreset(session.companyId, body.kind, name, body);
    return successResponse(created, 201);
  } catch (error) {
    return salesErrorResponse(error);
  }
}
