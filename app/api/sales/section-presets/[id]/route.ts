import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { deleteSectionPreset, renameSectionPreset } from '@/lib/sales/sectionPresets';
import { SalesError } from '@/lib/sales/service';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationManage) throw new SalesError('Forbidden', 403);
    const { id } = await params;
    const body = (await req.json()) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name : '';
    return successResponse(await renameSectionPreset(session.companyId, id, name));
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationManage) throw new SalesError('Forbidden', 403);
    const { id } = await params;
    return successResponse(await deleteSectionPreset(session.companyId, id));
  } catch (error) {
    return salesErrorResponse(error);
  }
}
