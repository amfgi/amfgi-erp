import { errorResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { beginPdfDownload, cancelPdfDownload, deliverPdfDownload, validPdfTicket } from '@/lib/sales/pdfDownloadTicket';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function pdfFileName(value: string | null) {
  const safe = (value ?? 'Quotation').replace(/[\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  const base = safe || 'Quotation';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(req: Request) {
  try {
    const session = await requireSalesSession();
    const url = new URL(req.url);
    const ticket = url.searchParams.get('ticket') ?? '';
    if (!validPdfTicket(ticket)) return errorResponse('Invalid download', 400);
    const pages = Number(url.searchParams.get('pages'));
    const stream = beginPdfDownload(ticket, session.userId, pages);
    if (!stream) return errorResponse('Forbidden', 403);
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(pdfFileName(url.searchParams.get('name'))),
        'Cache-Control': 'private, no-store',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSalesSession();
    const url = new URL(req.url);
    const ticket = url.searchParams.get('ticket') ?? '';
    if (!validPdfTicket(ticket)) return errorResponse('Invalid download', 400);
    if (url.searchParams.get('cancel') === '1') {
      cancelPdfDownload(ticket, session.userId);
      return Response.json({ ok: true });
    }
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (!deliverPdfDownload(ticket, session.userId, bytes)) return errorResponse('Could not build the PDF', 400);
    return Response.json({ ok: true });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
