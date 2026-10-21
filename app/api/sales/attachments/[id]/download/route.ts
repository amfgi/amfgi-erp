import { NextResponse } from 'next/server';

import { downloadDriveFile } from '@/lib/utils/googleDrive';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { getAttachmentForDownload, SalesError } from '@/lib/sales/service';

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const attachment = await getAttachmentForDownload(session.companyId, id, session.access);
    let bytes: Buffer;
    try {
      bytes = await downloadDriveFile(session.companyId, attachment.driveFileId);
    } catch (error) {
      throw new SalesError(error instanceof Error ? error.message : 'Could not download the file', 502);
    }
    const body = new Uint8Array(bytes);
    return new NextResponse(body, {
      headers: {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Disposition': contentDisposition(attachment.fileName),
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
