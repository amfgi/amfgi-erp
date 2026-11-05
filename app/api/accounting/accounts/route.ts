import { createAccount, listAccounts } from '@/lib/accounting/service';
import { accountingErrorResponse, requireAccountingCompany } from '@/lib/accounting/http';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET() {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  return successResponse(await listAccounts(ctx.companyId));
}

export async function POST(req: Request) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return errorResponse('Invalid request', 400);
  try {
    const created = await createAccount({
      companyId: ctx.companyId,
      name: String(body.name ?? ''),
      accountTypeId: String(body.accountTypeId ?? ''),
      parentId: body.parentId ? String(body.parentId) : null,
      code: body.code ? String(body.code) : null,
      description: body.description ? String(body.description) : null,
      note: body.note ? String(body.note) : null,
      isActive: body.isActive !== false,
    });
    return successResponse(created, 201);
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
