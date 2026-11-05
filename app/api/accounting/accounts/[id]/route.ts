import { deleteAccount, updateAccount } from '@/lib/accounting/service';
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
    const updated = await updateAccount({
      companyId: ctx.companyId,
      id,
      name: String(body.name ?? ''),
      accountTypeId: String(body.accountTypeId ?? ''),
      parentId: body.parentId ? String(body.parentId) : null,
      code: body.code ? String(body.code) : null,
      description: body.description ? String(body.description) : null,
      note: body.note ? String(body.note) : null,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
      applyToChildren: body.applyToChildren === true,
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
    await deleteAccount(ctx.companyId, id);
    return successResponse({ deleted: true });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
