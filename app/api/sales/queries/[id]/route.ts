import { successResponse } from '@/lib/utils/apiResponse';
import { updateSalesSchema } from '@/lib/sales/schemas';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { getSalesRecord, SalesError, updateSalesQuery } from '@/lib/sales/service';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    return successResponse(await getSalesRecord(session.companyId, id, session.access));
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const parsed = updateSalesSchema.safeParse(await req.json());
    if (!parsed.success) {
      return salesErrorResponse(new SalesError(parsed.error.issues[0]?.message ?? 'Check the fields and try again'));
    }
    const record = await updateSalesQuery({
      companyId: session.companyId,
      id,
      userId: session.userId,
      access: session.access,
      ...parsed.data,
    });
    return successResponse(record);
  } catch (error) {
    return salesErrorResponse(error);
  }
}
