import { successResponse } from '@/lib/utils/apiResponse';
import { createJobSchema } from '@/lib/sales/schemas';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { createJobFromSales, SalesError } from '@/lib/sales/service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const parsed = createJobSchema.safeParse(await req.json());
    if (!parsed.success) return salesErrorResponse(new SalesError(parsed.error.issues[0]?.message ?? 'Check the job details'));
    return successResponse(
      await createJobFromSales({
        companyId: session.companyId,
        id,
        userId: session.userId,
        access: session.access,
        ...parsed.data,
      }),
    );
  } catch (error) {
    return salesErrorResponse(error);
  }
}
