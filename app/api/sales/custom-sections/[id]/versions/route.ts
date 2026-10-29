import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import {
  addCustomSectionVersion,
  deleteCustomSectionVersion,
  renameCustomSectionVersion,
} from '@/lib/sales/customSections';
import { SalesError } from '@/lib/sales/service';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationManage) throw new SalesError('Forbidden', 403);
    const { id } = await params;
    const body = (await req.json()) as { name?: unknown; content?: unknown };
    const name = typeof body.name === 'string' ? body.name : '';
    return successResponse(await addCustomSectionVersion(session.companyId, id, name, body.content), 201);
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationManage) throw new SalesError('Forbidden', 403);
    const { id } = await params;
    const body = (await req.json()) as { versionId?: unknown; name?: unknown };
    const versionId = typeof body.versionId === 'string' ? body.versionId : '';
    const name = typeof body.name === 'string' ? body.name : '';
    return successResponse(await renameCustomSectionVersion(session.companyId, id, versionId, name));
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    if (!session.access.quotationManage) throw new SalesError('Forbidden', 403);
    const { id } = await params;
    const versionId = new URL(req.url).searchParams.get('versionId') ?? '';
    return successResponse(await deleteCustomSectionVersion(session.companyId, id, versionId));
  } catch (error) {
    return salesErrorResponse(error);
  }
}
