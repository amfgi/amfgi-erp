import { listAllJournals, listJournals, recordJournal } from '@/lib/accounting/service';
import { accountingErrorResponse, requireAccountingCompany } from '@/lib/accounting/http';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import type { JournalLineInput } from '@/lib/accounting/posting';

export async function GET(req: Request) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const url = new URL(req.url);
  const query = url.searchParams.get('q') ?? '';
  try {
    const rows = query.trim()
      ? await listJournals(ctx.companyId, query)
      : await listAllJournals(ctx.companyId);
    return successResponse(rows);
  } catch (error) {
    return accountingErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const ctx = await requireAccountingCompany();
  if ('error' in ctx) return ctx.error;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !Array.isArray(body.lines)) {
    return errorResponse('A journal is stored only when you save it.', 400);
  }
  try {
    const saved = await recordJournal({
      companyId: ctx.companyId,
      userId: ctx.userId,
      entryDate: String(body.entryDate ?? ''),
      idempotencyKey: String(body.idempotencyKey ?? ''),
      lines: body.lines as JournalLineInput[],
    });
    return successResponse(saved, 201);
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
