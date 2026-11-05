import { deleteStatementGroup, updateStatementGroup } from '@/lib/accounting/service';
import { accountingErrorResponse, requireAccountingCompany } from '@/lib/accounting/http';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return errorResponse('Invalid request', 400);
  try {
    const updated = await updateStatementGroup({
      companyId: ctx.companyId,
      id,
      name: String(body.name ?? ''),
      normalSide: String(body.normalSide ?? ''),
      reportsOn: String(body.reportsOn ?? ''),
      confirmReportsOn: body.confirmReportsOn === true,
      confirmNormalSide: body.confirmNormalSide === true,
    });
    return successResponse(updated);
  } catch (error) {
    return accountingErrorResponse(error);
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const { id } = await context.params;
  try {
    await deleteStatementGroup(ctx.companyId, id);
    return successResponse({ deleted: true });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
