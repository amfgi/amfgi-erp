import { successResponse } from '@/lib/utils/apiResponse';
import { closureSchema } from '@/lib/sales/schemas';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { SalesError, setSalesClosure } from '@/lib/sales/service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const parsed = closureSchema.safeParse(await req.json());
    if (!parsed.success) return salesErrorResponse(new SalesError('Choose Lost, Cancelled, or Reopen'));
    return successResponse(
      await setSalesClosure({
        companyId: session.companyId,
        id,
        access: session.access,
        closure: parsed.data.closure,
        reason: parsed.data.reason,
      }),
    );
  } catch (error) {
    return salesErrorResponse(error);
  }
}
