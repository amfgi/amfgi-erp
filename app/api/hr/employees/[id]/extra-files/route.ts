import { randomUUID } from 'crypto';

import { prisma } from '@/lib/db/prisma';
import {
  EXTRA_FILE_MAX_BYTES,
  EXTRA_FILE_MAX_COUNT,
  extraFileBaseName,
  extraFileExtension,
  extraFileStorageName,
  isAllowedExtraFile,
} from '@/lib/hr/employeeExtraFiles';
import { canHrDocumentCreate, canHrDocumentView } from '@/lib/hr/documentPermissions';
import { companyIdWhere, requireHrSession } from '@/lib/hr/requireHrSession';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { buildEmployeeDriveFolderName, deleteFromDrive, uploadToDrive } from '@/lib/utils/googleDrive';
import { driveFileIdToOpenUrl } from '@/lib/utils/googleDriveUrl';
import { getEffectiveGoogleDriveRootFolderId } from '@/lib/utils/globalSettings';

const fileSelect = {
  id: true,
  fileName: true,
  extension: true,
  mimeType: true,
  sizeBytes: true,
  mediaUrl: true,
  createdAt: true,
} as const;

async function findEmployee(employeeId: string, companyIds: string[]) {
  return prisma.employee.findFirst({
    where: { id: employeeId, ...companyIdWhere(companyIds) },
    select: { id: true, companyId: true, fullName: true },
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_DOCUMENT_VIEW });
  if (!ctx.ok) return ctx.response;
  if (!canHrDocumentView(ctx.session.user)) return errorResponse('Forbidden', 403);
  const { id } = await params;
  const employee = await findEmployee(id, ctx.companyIds);
  if (!employee) return errorResponse('Employee not found', 404);

  const files = await prisma.employeeExtraFile.findMany({
    where: { companyId: employee.companyId, employeeId: employee.id },
    select: fileSelect,
    orderBy: { createdAt: 'desc' },
  });
  return successResponse({ files });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_DOCUMENT_CREATE });
  if (!ctx.ok) return ctx.response;
  if (!canHrDocumentCreate(ctx.session.user)) return errorResponse('Forbidden', 403);
  const { id } = await params;
  const employee = await findEmployee(id, ctx.companyIds);
  if (!employee) return errorResponse('Employee not found', 404);

  const formData = await req.formData();
  const files = formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return errorResponse('Choose at least one file', 400);
  if (files.length > EXTRA_FILE_MAX_COUNT) {
    return errorResponse(`Upload at most ${EXTRA_FILE_MAX_COUNT} files at once`, 400);
  }

  const folderId = await getEffectiveGoogleDriveRootFolderId();
  if (!folderId) return errorResponse('Google Drive folder not configured', 500);

  const created: Array<{ id: string; fileName: string }> = [];
  const errors: Array<{ fileName: string; message: string }> = [];

  for (const file of files) {
    const fileName = extraFileBaseName(file.name);
    if (!fileName || !isAllowedExtraFile(fileName)) {
      errors.push({ fileName: fileName || file.name, message: 'Allowed types: PDF, images, Word, Excel, CSV, TXT' });
      continue;
    }
    if (file.size > EXTRA_FILE_MAX_BYTES) {
      errors.push({ fileName, message: 'File size must not exceed 20 MB' });
      continue;
    }

    const extension = extraFileExtension(fileName);
    const storageName = extraFileStorageName(fileName, randomUUID().slice(0, 8));
    let driveFileId = '';
    try {
      const uploaded = await uploadToDrive(Buffer.from(await file.arrayBuffer()), storageName, file.type || 'application/octet-stream', {
        companyId: employee.companyId,
        rootFolderId: folderId,
        folderPath: [
          { key: 'drive-folder:employees-root', name: 'Employees' },
          {
            key: `drive-folder:employee:${employee.id}`,
            name: buildEmployeeDriveFolderName(employee.fullName, employee.id),
          },
          { key: `drive-folder:employee:${employee.id}:extra-files`, name: 'Extra files' },
        ],
      });
      driveFileId = uploaded.id;
      const row = await prisma.employeeExtraFile.create({
        data: {
          companyId: employee.companyId,
          employeeId: employee.id,
          fileName,
          extension,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          mediaUrl: driveFileIdToOpenUrl(uploaded.id) ?? uploaded.viewerUrl,
          driveFileId: uploaded.id,
        },
        select: { id: true, fileName: true },
      });
      created.push(row);
    } catch (error) {
      if (driveFileId) {
        try {
          await deleteFromDrive(driveFileId, employee.companyId);
        } catch (cleanupError) {
          console.error('Failed to remove extra file after save error:', cleanupError);
        }
      }
      errors.push({
        fileName,
        message: error instanceof Error ? error.message : 'Upload failed',
      });
    }
  }

  if (created.length === 0) {
    return errorResponse(errors[0]?.message ?? 'Upload failed', 400);
  }
  return successResponse({ created, errors });
}
