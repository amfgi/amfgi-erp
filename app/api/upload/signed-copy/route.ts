import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import {
  buildCustomerDriveFolderName,
  buildJobDriveFolderName,
  buildSignedDeliveryNoteDriveFileName,
  deleteFromDrive,
  uploadToDrive,
} from '@/lib/utils/googleDrive';
import { extractGoogleDriveFileId } from '@/lib/utils/googleDriveUrl';
import { getEffectiveGoogleDriveRootFolderId } from '@/lib/utils/globalSettings';
import { formatDeliveryNoteDriveLabel, resolveDeliveryNoteNumber } from '@/lib/deliveryNoteNumber';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

type DriveJobContext = {
  id: string;
  jobNumber: string;
  customerId: string;
  customerName: string;
};

function resolveDriveJobContext(
  job:
    | {
        id: string;
        jobNumber: string;
        customerId: string | null;
        customer: { id: string; name: string } | null;
      }
    | null
    | undefined
): DriveJobContext {
  return {
    id: job?.id ?? 'job',
    jobNumber: job?.jobNumber ?? 'JOB',
    customerId: job?.customer?.id ?? job?.customerId ?? 'customer',
    customerName: job?.customer?.name ?? 'Customer',
  };
}

async function uploadSignedCopyToDrive(params: {
  companyId: string;
  file: File;
  deliveryNoteLabel: string;
  driveJob: DriveJobContext;
  fileKey: string;
  existingSignedCopyUrl?: string | null;
}) {
  const { companyId, file, deliveryNoteLabel, driveJob, fileKey, existingSignedCopyUrl } = params;

  if (!ALLOWED_MIMES.includes(file.type)) {
    throw new Error('Only images (JPEG, PNG, WebP) or PDF files are allowed');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('File size must not exceed 20 MB');
  }

  const folderId = await getEffectiveGoogleDriveRootFolderId();
  if (!folderId) throw new Error('Google Drive folder not configured');

  const oldDriveId = extractGoogleDriveFileId(existingSignedCopyUrl ?? '');
  if (oldDriveId) {
    try {
      await deleteFromDrive(oldDriveId, companyId);
    } catch (err) {
      console.error('Failed to delete old signed copy from Drive:', err);
    }
  }

  const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg';
  const fileName = buildSignedDeliveryNoteDriveFileName(
    deliveryNoteLabel,
    driveJob.jobNumber,
    fileKey,
    ext
  );
  const buffer = Buffer.from(await file.arrayBuffer());

  const { viewerUrl } = await uploadToDrive(buffer, fileName, file.type, {
    companyId,
    rootFolderId: folderId,
    folderPath: [
      { key: 'drive-folder:customer-root', name: 'Customer' },
      {
        key: `drive-folder:customer:${driveJob.customerId}`,
        name: buildCustomerDriveFolderName(driveJob.customerName, driveJob.customerId),
      },
      {
        key: `drive-folder:job:${driveJob.id}`,
        name: buildJobDriveFolderName(driveJob.jobNumber, driveJob.id),
      },
    ],
  });

  return viewerUrl;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const isSA = session.user.isSuperAdmin ?? false;
  const perms = (session.user.permissions ?? []) as string[];
  const hasPermission = isSA || perms.includes('transaction.stock_out');

  if (!hasPermission) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const transactionId = (formData.get('transactionId') as string | null)?.trim() || null;
    const deliveryNoteId = (formData.get('deliveryNoteId') as string | null)?.trim() || null;

    if (!file) return errorResponse('File is required', 400);
    if (!transactionId && !deliveryNoteId) {
      return errorResponse('Transaction ID or delivery note ID is required', 400);
    }

    const companyId = session.user.activeCompanyId;

    if (deliveryNoteId) {
      const deliveryNote = await prisma.deliveryNote.findFirst({
        where: { id: deliveryNoteId, companyId },
        select: {
          id: true,
          number: true,
          signedCopyUrl: true,
          job: {
            select: {
              id: true,
              jobNumber: true,
              customerId: true,
              customer: { select: { id: true, name: true } },
            },
          },
          referenceJob: {
            select: {
              id: true,
              jobNumber: true,
              customerId: true,
              customer: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (!deliveryNote) return errorResponse('Delivery note not found', 404);

      const driveJob = resolveDriveJobContext(deliveryNote.job ?? deliveryNote.referenceJob);
      const viewerUrl = await uploadSignedCopyToDrive({
        companyId,
        file,
        deliveryNoteLabel: formatDeliveryNoteDriveLabel(deliveryNote.number),
        driveJob,
        fileKey: deliveryNote.id,
        existingSignedCopyUrl: deliveryNote.signedCopyUrl,
      });

      await prisma.deliveryNote.update({
        where: { id: deliveryNote.id },
        data: { signedCopyUrl: viewerUrl },
      });

      return successResponse({ signedCopyUrl: viewerUrl });
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId! },
      select: {
        id: true,
        companyId: true,
        isDeliveryNote: true,
        notes: true,
        signedCopyUrl: true,
        jobId: true,
        deliveryNoteId: true,
        deliveryNote: {
          select: { id: true, number: true, signedCopyUrl: true },
        },
        job: {
          select: {
            id: true,
            jobNumber: true,
            customerId: true,
            customer: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!transaction) return errorResponse('Transaction not found', 404);
    if (transaction.companyId !== companyId) return errorResponse('Forbidden', 403);
    if (!transaction.isDeliveryNote) {
      return errorResponse('Signed copies can only be uploaded for delivery notes', 400);
    }

    const driveJob = resolveDriveJobContext(transaction.job);
    const viewerUrl = await uploadSignedCopyToDrive({
      companyId: transaction.companyId,
      file,
      deliveryNoteLabel: formatDeliveryNoteDriveLabel(
        resolveDeliveryNoteNumber(transaction.notes, transaction.deliveryNote),
      ),
      driveJob,
      fileKey: transaction.id,
      existingSignedCopyUrl: transaction.signedCopyUrl ?? transaction.deliveryNote?.signedCopyUrl,
    });

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { signedCopyUrl: viewerUrl },
    });

    if (transaction.deliveryNoteId) {
      await prisma.deliveryNote.update({
        where: { id: transaction.deliveryNoteId },
        data: { signedCopyUrl: viewerUrl },
      });
    }

    return successResponse({ signedCopyUrl: viewerUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('Signed copy upload error:', err);
    const status =
      message.includes('Only images') || message.includes('File size') ? 400 : message.includes('not configured') ? 500 : 500;
    return errorResponse(message, status);
  }
}
