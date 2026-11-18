import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { addQuotationDocument, listQuotationDocuments } from '@/lib/sales/quotationDocuments';
import { SalesError } from '@/lib/sales/service';
import { successResponse } from '@/lib/utils/apiResponse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    return successResponse(await listQuotationDocuments({
      companyId: session.companyId,
      id,
      access: session.access,
    }));
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) throw new SalesError('File is required');
    const typeId = String(formData.get('typeId') ?? '').trim() || null;
    const newTypeName = String(formData.get('newTypeName') ?? '').trim() || null;
    const note = String(formData.get('note') ?? '');
    return successResponse(await addQuotationDocument({
      companyId: session.companyId,
      id,
      access: session.access,
      actorId: session.userId,
      file,
      typeId,
      newTypeName,
      note,
    }), 201);
  } catch (error) {
    return salesErrorResponse(error);
  }
}
