import { z } from 'zod';

import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { forwardToQuotation, SalesError } from '@/lib/sales/service';

const bodySchema = z.object({
  assigneeId: z.string().trim().min(1, 'Choose who this quotation is assigned to'),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return salesErrorResponse(new SalesError(parsed.error.issues[0]?.message ?? 'Choose who this quotation is assigned to'));
    }
    return successResponse(
      await forwardToQuotation({
        companyId: session.companyId,
        id,
        access: session.access,
        assigneeId: parsed.data.assigneeId,
        actorId: session.userId,
      }),
    );
  } catch (error) {
    return salesErrorResponse(error);
  }
}
