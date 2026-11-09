import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { reviseQuotation, SalesError } from '@/lib/sales/service';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const raw = await request.text();
    let fromRevisionId: string | undefined;
    let quotationDocument: unknown;
    let startDate: string | null | undefined;
    if (raw.trim()) {
      let body: { fromRevisionId?: unknown; quotationDocument?: unknown; startDate?: unknown };
      try {
        body = JSON.parse(raw) as typeof body;
      } catch {
        throw new SalesError('Invalid revision request');
      }
      if (body.fromRevisionId != null && typeof body.fromRevisionId !== 'string') {
        throw new SalesError('Invalid revision');
      }
      if (typeof body.fromRevisionId === 'string' && body.fromRevisionId) fromRevisionId = body.fromRevisionId;
      if ('quotationDocument' in body) quotationDocument = body.quotationDocument;
      if ('startDate' in body) startDate = typeof body.startDate === 'string' ? body.startDate : null;
    }
    return successResponse(
      await reviseQuotation({
        companyId: session.companyId,
        id,
        access: session.access,
        actorId: session.userId,
        fromRevisionId,
        quotationDocument,
        startDate,
      }),
    );
  } catch (error) {
    return salesErrorResponse(error);
  }
}
