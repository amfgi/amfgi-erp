import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { salesAccess } from '@/lib/sales/access';
import { salesErrorResponse } from '@/lib/sales/http';
import { getCarriedQuotationDocumentForJobDownload, getQuotationDocumentForDownload } from '@/lib/sales/quotationDocuments';
import { SalesError } from '@/lib/sales/service';
import { canViewJobDetailForHrPicker } from '@/lib/permissions/stockModuleAccess';
import { downloadDriveFile } from '@/lib/utils/googleDrive';

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) throw new SalesError('Unauthorized', 401);
    if (!session.user.activeCompanyId) throw new SalesError('No active company selected', 400);
    const { id } = await params;
    const companyId = session.user.activeCompanyId;
    const access = salesAccess(session.user);
    let document: { fileName: string; mimeType: string; driveFileId: string };
    try {
      document = await getQuotationDocumentForDownload(companyId, id, access);
    } catch (error) {
      const canViewJob = canViewJobDetailForHrPicker(session.user.permissions, session.user.isSuperAdmin ?? false);
      if (!canViewJob) throw error;
      if (error instanceof SalesError && error.status !== 403) throw error;
      document = await getCarriedQuotationDocumentForJobDownload(companyId, id);
    }
    let bytes: Buffer;
    try {
      bytes = await downloadDriveFile(companyId, document.driveFileId);
    } catch (error) {
      throw new SalesError(error instanceof Error ? error.message : 'Could not download the file', 502);
    }
    const body = new Uint8Array(bytes);
    return new NextResponse(body, {
      headers: {
        'Content-Type': document.mimeType || 'application/octet-stream',
        'Content-Disposition': contentDisposition(document.fileName),
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
