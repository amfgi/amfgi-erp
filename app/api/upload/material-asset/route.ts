import { auth } from '@/auth';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import {
  explainGoogleDriveError,
  uploadToDrive,
} from '@/lib/utils/googleDrive';
import { getEffectiveGoogleDriveRootFolderId } from '@/lib/utils/globalSettings';

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const FILE_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  ...IMAGE_MIMES,
];

function sanitizeFileName(name: string, fallback: string) {
  const trimmed = name
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return trimmed || fallback;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const isSA = session.user.isSuperAdmin ?? false;
  const perms = (session.user.permissions ?? []) as string[];
  if (!isSA && !perms.includes('material.create') && !perms.includes('material.edit')) {
    return errorResponse('Forbidden', 403);
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const materialName = String(formData.get('materialName') ?? '').trim();
    const materialId = String(formData.get('materialId') ?? '').trim();
    const assetType = String(formData.get('assetType') ?? 'document').trim().toLowerCase();

    if (!file) return errorResponse('File is required', 400);
    if (!materialName) return errorResponse('Material name is required', 400);
    if (file.size > 15 * 1024 * 1024) {
      return errorResponse('File size must not exceed 15 MB', 400);
    }

    const normalizedAssetType =
      assetType === 'feature-image' || assetType === 'photo-gallery' || assetType === 'document'
        ? assetType
        : 'document';
    const allowedMimes =
      normalizedAssetType === 'feature-image' || normalizedAssetType === 'photo-gallery'
        ? IMAGE_MIMES
        : FILE_MIMES;
    if (!allowedMimes.includes(file.type)) {
      return errorResponse('File type is not allowed', 400);
    }

    const rootFolderId = await getEffectiveGoogleDriveRootFolderId();
    if (!rootFolderId) return errorResponse('Google Drive folder not configured', 500);

    const companyId = session.user.activeCompanyId;
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const baseName =
      normalizedAssetType === 'feature-image'
        ? `${materialName} feature image`
        : normalizedAssetType === 'photo-gallery'
          ? `${materialName} gallery`
          : `${materialName} document`;
    const uploadName = `${sanitizeFileName(baseName, 'Material asset')}${ext}`;

    const { viewerUrl } = await uploadToDrive(
      Buffer.from(await file.arrayBuffer()),
      uploadName,
      file.type || 'application/octet-stream',
      {
        companyId,
        rootFolderId,
        folderPath: [
          { key: 'drive-folder:company:materials', name: 'Materials' },
          {
            key: materialId
              ? `drive-folder:company:material:${materialId}`
              : `drive-folder:company:material:${materialName.toLowerCase()}`,
            name: materialName,
          },
          ...(normalizedAssetType === 'document'
            ? [
                {
                  key: materialId
                    ? `drive-folder:company:material:${materialId}:documents`
                    : 'drive-folder:company:material:documents',
                  name: 'Documents',
                },
              ]
            : [
                {
                  key: materialId
                    ? `drive-folder:company:material:${materialId}:photos`
                    : 'drive-folder:company:material:photos',
                  name: 'Photos',
                },
              ]),
        ],
      },
    );

    return successResponse({
      url: viewerUrl,
      fileName: sanitizeFileName(file.name, uploadName),
      mimeType: file.type || 'application/octet-stream',
      assetType: normalizedAssetType,
    });
  } catch (error: unknown) {
    const message = explainGoogleDriveError(error);
    return errorResponse(message, 500);
  }
}
