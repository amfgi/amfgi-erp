import { createAccountType, listAccountTypes } from '@/lib/accounting/service';
import { accountingErrorResponse, requireAccountingCompany } from '@/lib/accounting/http';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET() {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const types = await listAccountTypes(ctx.companyId);
  return successResponse(types);
}

export async function POST(req: Request) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return errorResponse('Invalid request', 400);
  try {
    const created = await createAccountType({
      companyId: ctx.companyId,
      name: String(body.name ?? ''),
      statementGroupId: String(body.statementGroupId ?? ''),
      increaseSide: String(body.increaseSide ?? ''),
      confirmContra: body.confirmContra === true,
    });
    return successResponse(created, 201);
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
