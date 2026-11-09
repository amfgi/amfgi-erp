import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { removeQuotationDocumentType } from '@/lib/sales/quotationDocuments';
import { successResponse } from '@/lib/utils/apiResponse';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; typeId: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id, typeId } = await params;
    return successResponse(await removeQuotationDocumentType({
      companyId: session.companyId,
      id,
      access: session.access,
      typeId,
    }));
  } catch (error) {
    return salesErrorResponse(error);
  }
}
