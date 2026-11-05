import { trialBalance } from '@/lib/accounting/service';
import { accountingErrorResponse, requireAccountingCompany } from '@/lib/accounting/http';
import { successResponse } from '@/lib/utils/apiResponse';

export async function GET() {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  try {
    return successResponse(await trialBalance(ctx.companyId));
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
