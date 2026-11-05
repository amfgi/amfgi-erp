import { listTemplates } from '@/lib/accounting/service';
import { requireAccountingCompany } from '@/lib/accounting/http';
import { successResponse } from '@/lib/utils/apiResponse';

export async function GET() {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  return successResponse(await listTemplates(ctx.companyId));
}
