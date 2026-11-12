import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db/prisma';
import { canHrDocumentDelete, canHrDocumentView } from '@/lib/hr/documentPermissions';
import { companyIdWhere, requireHrSession } from '@/lib/hr/requireHrSession';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { deleteFromDrive, downloadDriveFile } from '@/lib/utils/googleDrive';

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function findFile(employeeId: string, fileId: string, companyIds: string[]) {
  return prisma.employeeExtraFile.findFirst({
    where: { id: fileId, employeeId, ...companyIdWhere(companyIds) },
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_DOCUMENT_VIEW });
  if (!ctx.ok) return ctx.response;
  if (!canHrDocumentView(ctx.session.user)) return errorResponse('Forbidden', 403);
  const { id, fileId } = await params;
  const file = await findFile(id, fileId, ctx.companyIds);
  if (!file) return errorResponse('File not found', 404);

  try {
    const bytes = await downloadDriveFile(file.companyId, file.driveFileId);
    const body = new Uint8Array(bytes);
    return new NextResponse(body, {
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': contentDisposition(file.fileName),
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not download the file';
    return errorResponse(message, 502);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_DOCUMENT_DELETE });
  if (!ctx.ok) return ctx.response;
  if (!canHrDocumentDelete(ctx.session.user)) return errorResponse('Forbidden', 403);
  const { id, fileId } = await params;
  const file = await findFile(id, fileId, ctx.companyIds);
  if (!file) return errorResponse('File not found', 404);

  try {
    await deleteFromDrive(file.driveFileId, file.companyId);
  } catch (error) {
    console.error('Failed to delete extra employee file from Drive:', error);
    return errorResponse(error instanceof Error ? error.message : 'Could not delete the file', 502);
  }

  await prisma.employeeExtraFile.delete({ where: { id: file.id } });
  return successResponse({ id: file.id });
}
