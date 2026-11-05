import { copyJournal } from '@/lib/accounting/service';
import { accountingErrorResponse, requireAccountingCompany } from '@/lib/accounting/http';
import { successResponse } from '@/lib/utils/apiResponse';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: RouteContext) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const { id } = await context.params;
  try {
    return successResponse(await copyJournal(ctx.companyId, ctx.userId, id), 201);
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
