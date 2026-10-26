import { prisma } from '@/lib/db/prisma';
import { successResponse } from '@/lib/utils/apiResponse';
import { uploadToDrive } from '@/lib/utils/googleDrive';
import { getEffectiveGoogleDriveRootFolderId } from '@/lib/utils/globalSettings';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { assertSalesUpload, assertUploadFile, SalesError } from '@/lib/sales/service';
import { writeSalesWorkLog } from '@/lib/sales/workLog';
import type { SalesAttachmentKind } from '@prisma/client';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const record = await prisma.salesQuery.findFirst({
      where: { id, companyId: session.companyId },
      select: { id: true, queryNumber: true, stage: true, closure: true },
    });
    if (!record) throw new SalesError('Sales record not found', 404);

    const formData = await req.formData();
    const file = formData.get('file');
    const kindRaw = String(formData.get('kind') ?? 'CLIENT');
    const kind: SalesAttachmentKind = kindRaw === 'PO' ? 'PO' : 'CLIENT';
    if (!(file instanceof File)) throw new SalesError('File is required');
    assertSalesUpload({ access: session.access, stage: record.stage, closure: record.closure, kind });
    assertUploadFile(file);

    const folderId = await getEffectiveGoogleDriveRootFolderId();
    if (!folderId) throw new SalesError('Google Drive folder not configured');

    const buffer = Buffer.from(await file.arrayBuffer());
    const kindFolder = kind === 'PO'
      ? { key: `drive-folder:sales-query:${record.id}:po`, name: 'Purchase order' }
      : { key: `drive-folder:sales-query:${record.id}:client`, name: 'Client files' };
    const uploaded = await uploadToDrive(buffer, file.name, file.type, {
      companyId: session.companyId,
      rootFolderId: folderId,
      folderPath: [
        { key: 'drive-folder:sales-root', name: 'Sales' },
        { key: `drive-folder:sales-query:${record.id}`, name: `${record.queryNumber} - ${record.id}` },
        kindFolder,
      ],
    });

    const attachment = await prisma.salesAttachment.create({
      data: {
        companyId: session.companyId,
        salesQueryId: record.id,
        kind,
        fileName: file.name,
        mimeType: file.type,
        driveFileId: uploaded.id,
        viewerUrl: uploaded.viewerUrl,
        uploadedById: session.userId,
      },
    });
    await writeSalesWorkLog(prisma, {
      companyId: session.companyId,
      salesQueryId: record.id,
      actorId: session.userId,
      action: 'FILE_UPLOADED',
      detail: file.name,
    });
    return successResponse(attachment, 201);
  } catch (error) {
    return salesErrorResponse(error);
  }
}
