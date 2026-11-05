import { deleteDraft, getJournal, saveJournal } from '@/lib/accounting/service';
import { accountingErrorResponse, requireAccountingCompany } from '@/lib/accounting/http';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import type { JournalLineInput } from '@/lib/accounting/posting';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const { id } = await context.params;
  try {
    return successResponse(await getJournal(ctx.companyId, id));
  } catch (error) {
    return accountingErrorResponse(error);
  }
}

export async function PUT(req: Request, context: RouteContext) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return errorResponse('Invalid request', 400);
  const lines = Array.isArray(body.lines) ? (body.lines as JournalLineInput[]) : [];
  try {
    const saved = await saveJournal({
      companyId: ctx.companyId,
      id,
      userId: ctx.userId,
      entryDate: String(body.entryDate ?? ''),
      idempotencyKey: String(body.idempotencyKey ?? ''),
      lines,
    });
    return successResponse(saved);
  } catch (error) {
    return accountingErrorResponse(error);
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const { id } = await context.params;
  try {
    await deleteDraft(ctx.companyId, id);
    return successResponse({ deleted: true });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
