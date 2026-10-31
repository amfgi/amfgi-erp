import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { auth } from '@/auth';
import { canAccessSettingsSerial } from '@/lib/auth/settingsAccess';
import { prisma } from '@/lib/db/prisma';
import {
  MAX_DOCUMENT_SERIAL,
  normalizeDocumentSerialSettings,
} from '@/lib/sales/documentSerialSettings';
import { describeDocumentSerials, readDocumentSerialSettings } from '@/lib/sales/nextDocumentSerial';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

const PrefixSchema = z.string().trim().regex(/^[A-Za-z0-9]{1,6}$/);

const BodySchema = z.object({
  query: z.number().int().min(1).max(MAX_DOCUMENT_SERIAL),
  quotation: z.number().int().min(1).max(MAX_DOCUMENT_SERIAL),
  purchaseOrder: z.number().int().min(1).max(MAX_DOCUMENT_SERIAL),
  job: z.number().int().min(1).max(MAX_DOCUMENT_SERIAL),
  prefixes: z.object({
    query: PrefixSchema,
    quotation: PrefixSchema,
    purchaseOrder: PrefixSchema,
    job: PrefixSchema,
  }).optional(),
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
    return errorResponse('Enter a starting tag of letters or digits, and a whole serial of 1 or more', 422);
  }

  const existing = await readDocumentSerialSettings(prisma, session.user.activeCompanyId);
  let prefixes = existing.prefixes;
  if (session.user.isSuperAdmin && parsed.data.prefixes) {
    const next = {
      query: parsed.data.prefixes.query.toUpperCase(),
      quotation: parsed.data.prefixes.quotation.toUpperCase(),
      purchaseOrder: parsed.data.prefixes.purchaseOrder.toUpperCase(),
      job: parsed.data.prefixes.job.toUpperCase(),
    };
    if (new Set(Object.values(next)).size !== 4) {
      return errorResponse('Each starting tag must be different', 422);
    }
    prefixes = next;
  }

  const settings = normalizeDocumentSerialSettings({
    query: parsed.data.query,
    quotation: parsed.data.quotation,
    purchaseOrder: parsed.data.purchaseOrder,
    job: parsed.data.job,
    prefixes,
  });
  await prisma.company.update({
    where: { id: session.user.activeCompanyId },
    data: {
      documentSerialSettings: settings as unknown as Prisma.InputJsonValue,
    },
  });

  const view = await describeDocumentSerials(prisma, session.user.activeCompanyId);
  return successResponse(view);
}
