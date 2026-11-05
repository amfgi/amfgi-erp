import { memoriseJournal } from '@/lib/accounting/service';
import { accountingErrorResponse, requireAccountingCompany } from '@/lib/accounting/http';
import { successResponse } from '@/lib/utils/apiResponse';
import type { JournalLineInput } from '@/lib/accounting/posting';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: RouteContext) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const lines = body && typeof body === 'object' && Array.isArray(body.lines)
    ? (body.lines as JournalLineInput[])
    : undefined;
  try {
    return successResponse(await memoriseJournal(ctx.companyId, id, lines), 201);
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
