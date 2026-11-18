import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { removeQuotationDocument, updateQuotationDocumentNote } from '@/lib/sales/quotationDocuments';
import { successResponse } from '@/lib/utils/apiResponse';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const note = body && typeof body === 'object' && 'note' in body && typeof body.note === 'string' ? body.note : '';
    return successResponse(await updateQuotationDocumentNote({
      companyId: session.companyId,
      id,
      access: session.access,
      actorId: session.userId,
      note,
    }));
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    return successResponse(await removeQuotationDocument({
      companyId: session.companyId,
      id,
      access: session.access,
      actorId: session.userId,
    }));
  } catch (error) {
    return salesErrorResponse(error);
  }
}
