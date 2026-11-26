import { errorResponse } from '@/lib/utils/apiResponse';
import { requireHrSession } from '@/lib/hr/requireHrSession';
import { beginPdfDownload, cancelPdfDownload, deliverPdfDownload, validPdfTicket } from '@/lib/sales/pdfDownloadTicket';
import { P } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function pdfFileName(value: string | null) {
  const safe = (value ?? 'Employee report').replace(/[\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  const base = safe || 'Employee report';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(req: Request) {
  const ctx = await requireHrSession({ permission: P.HR_EMPLOYEE_VIEW });
  if (!ctx.ok) return ctx.response;
  const url = new URL(req.url);
  const ticket = url.searchParams.get('ticket') ?? '';
  if (!validPdfTicket(ticket)) return errorResponse('Invalid download', 400);
  const pages = Number(url.searchParams.get('pages'));
  const stream = beginPdfDownload(ticket, ctx.session.user.id, pages);
  if (!stream) return errorResponse('Forbidden', 403);
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(pdfFileName(url.searchParams.get('name'))),
      'Cache-Control': 'private, no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function POST(req: Request) {
  const ctx = await requireHrSession({ permission: P.HR_EMPLOYEE_VIEW });
  if (!ctx.ok) return ctx.response;
  const url = new URL(req.url);
  const ticket = url.searchParams.get('ticket') ?? '';
  if (!validPdfTicket(ticket)) return errorResponse('Invalid download', 400);
  if (url.searchParams.get('cancel') === '1') {
    cancelPdfDownload(ticket, ctx.session.user.id);
    return Response.json({ ok: true });
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!deliverPdfDownload(ticket, ctx.session.user.id, bytes)) return errorResponse('Could not build the PDF', 400);
  return Response.json({ ok: true });
}
