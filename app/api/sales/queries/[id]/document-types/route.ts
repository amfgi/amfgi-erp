import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { createQuotationDocumentType } from '@/lib/sales/quotationDocuments';
import { successResponse } from '@/lib/utils/apiResponse';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const name = body && typeof body === 'object' && 'name' in body && typeof body.name === 'string' ? body.name : '';
    return successResponse(await createQuotationDocumentType({
      companyId: session.companyId,
      id,
      access: session.access,
      name,
    }), 201);
  } catch (error) {
    return salesErrorResponse(error);
  }
}
