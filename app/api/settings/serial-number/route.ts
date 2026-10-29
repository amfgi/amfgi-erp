import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { auth } from '@/auth';
import { canAccessSettingsSerial } from '@/lib/auth/settingsAccess';
import { prisma } from '@/lib/db/prisma';
import {
  MAX_DOCUMENT_SERIAL,
  normalizeDocumentSerialSettings,
} from '@/lib/sales/documentSerialSettings';
import { describeDocumentSerials } from '@/lib/sales/nextDocumentSerial';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

const BodySchema = z.object({
  query: z.number().int().min(1).max(MAX_DOCUMENT_SERIAL),
  quotation: z.number().int().min(1).max(MAX_DOCUMENT_SERIAL),
  purchaseOrder: z.number().int().min(1).max(MAX_DOCUMENT_SERIAL),
  job: z.number().int().min(1).max(MAX_DOCUMENT_SERIAL),
});

function canManage(user: { isSuperAdmin: boolean; permissions: string[] }) {
  return canAccessSettingsSerial({
    isSuperAdmin: user.isSuperAdmin,
    permissions: user.permissions,
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  if (!canManage(session.user)) return errorResponse('Forbidden', 403);

  const view = await describeDocumentSerials(prisma, session.user.activeCompanyId);
  return successResponse(view);
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  if (!canManage(session.user)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('Enter a whole serial number of 1 or more for each document', 422);
  }

  const settings = normalizeDocumentSerialSettings(parsed.data);
  await prisma.company.update({
    where: { id: session.user.activeCompanyId },
    data: {
      documentSerialSettings: settings as unknown as Prisma.InputJsonValue,
    },
  });

  const view = await describeDocumentSerials(prisma, session.user.activeCompanyId);
  return successResponse(view);
}
