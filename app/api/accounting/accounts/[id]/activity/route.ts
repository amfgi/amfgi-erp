import { accountQuickReport } from '@/lib/accounting/service';
import { accountingErrorResponse, requireAccountingCompany } from '@/lib/accounting/http';
import { successResponse } from '@/lib/utils/apiResponse';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: RouteContext) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const { id } = await context.params;
  const url = new URL(req.url);
  try {
    return successResponse(await accountQuickReport(
      ctx.companyId,
      id,
      url.searchParams.get('from') ?? '',
      url.searchParams.get('to') ?? '',
    ));
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
