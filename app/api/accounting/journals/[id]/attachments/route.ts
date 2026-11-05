import { addAttachment } from '@/lib/accounting/service';
import { accountingErrorResponse, requireAccountingCompany } from '@/lib/accounting/http';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: RouteContext) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return errorResponse('Invalid request', 400);
  try {
    const attachment = await addAttachment(ctx.companyId, id, String(body.fileName ?? ''));
    return successResponse(attachment, 201);
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
