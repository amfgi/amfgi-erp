import { successResponse } from '@/lib/utils/apiResponse';
import { receivePurchaseOrderSchema } from '@/lib/sales/schemas';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { receivePurchaseOrder, SalesError } from '@/lib/sales/service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const parsed = receivePurchaseOrderSchema.safeParse(await req.json());
    if (!parsed.success) return salesErrorResponse(new SalesError('Choose the accepted quotation option'));
    return successResponse(
      await receivePurchaseOrder({
        companyId: session.companyId,
        id,
        access: session.access,
        ...parsed.data,
      }),
    );
  } catch (error) {
    return salesErrorResponse(error);
  }
}
