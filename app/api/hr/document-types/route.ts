import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { ensureDefaultEmployeeDocumentTypes } from '@/lib/hr/defaultDocumentTypes';
import {
  canHrDocumentTypeCreate,
  canHrDocumentTypeEdit,
  canHrDocumentTypeView,
} from '@/lib/hr/documentTypePermissions';
import { P } from '@/lib/permissions';
import { requireHrSession, resolveHrWriteCompanyId } from '@/lib/hr/requireHrSession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const companySelect = { id: true, name: true, slug: true } as const;

const CreateSchema = z.object({
  companyId: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i, 'Slug: letters, numbers, hyphen'),
  requiresVisaPeriod: z.boolean().optional(),
  requiresExpiry: z.boolean().optional(),
  defaultAlertDaysBeforeExpiry: z.number().int().min(0).max(3650).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

async function requireDocumentTypeListSession(searchParams: URLSearchParams) {
  const permOrder = [P.HR_DOCUMENT_TYPE_VIEW, P.HR_DOCUMENT_VIEW, P.HR_SETTINGS_DOC_TYPES];
  for (const permission of permOrder) {
    const ctx = await requireHrSession({
      permission,
      companyId: searchParams.get('companyId'),
    });
    if (ctx.ok) return ctx;
  }
  return requireHrSession({
    permission: P.HR_DOCUMENT_TYPE_VIEW,
    companyId: searchParams.get('companyId'),
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ctx = await requireDocumentTypeListSession(searchParams);
  if (!ctx.ok) return ctx.response;
  const { session } = ctx;
  if (!canHrDocumentTypeView(session.user)) return errorResponse('Forbidden', 403);

  let companyId = ctx.companyId;
  if (!companyId) {
    companyId = resolveHrWriteCompanyId({
      requestedCompanyId: searchParams.get('companyId'),
      activeCompanyId: ctx.session.user.activeCompanyId,
    });
  }
  if (!companyId || !ctx.companyIds.includes(companyId)) {
    return errorResponse('companyId is required', 400);
  }

  const list = await prisma.employeeDocumentType.findMany({
    where: { companyId },
    include: { company: { select: companySelect } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return successResponse(list);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const ctx = await requireHrSession({ permission: P.HR_DOCUMENT_TYPE_CREATE });
  if (!ctx.ok) return ctx.response;
  const { session } = ctx;
  if (!canHrDocumentTypeCreate(session.user)) return errorResponse('Forbidden', 403);

  const companyId = resolveHrWriteCompanyId({
    requestedCompanyId: parsed.data.companyId,
    activeCompanyId: ctx.session.user.activeCompanyId,
  });
  if (!companyId || !ctx.companyIds.includes(companyId)) {
    return errorResponse('companyId is required', 400);
  }
  const d = parsed.data;

  try {
    const row = await prisma.employeeDocumentType.create({
      data: {
        companyId,
        name: d.name.trim(),
        slug: d.slug.trim().toLowerCase(),
        requiresVisaPeriod: d.requiresVisaPeriod ?? false,
        requiresExpiry: d.requiresExpiry ?? true,
        defaultAlertDaysBeforeExpiry: d.defaultAlertDaysBeforeExpiry ?? 30,
        sortOrder: d.sortOrder ?? 0,
        isActive: d.isActive ?? true,
      },
      include: { company: { select: companySelect } },
    });
    publishLiveUpdate({
      companyId,
      channel: 'hr',
      entity: 'document-type',
      action: 'created',
    });
    return successResponse(row, 201);
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return errorResponse('Duplicate slug for this company', 409);
    }
    throw e;
  }
}

/** Idempotent: upserts catalog types from `lib/hr/defaultDocumentTypes`. */
export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url);
  const ctx = await requireHrSession({
    permission: P.HR_DOCUMENT_TYPE_EDIT,
    companyId: searchParams.get('companyId'),
  });
  if (!ctx.ok) return ctx.response;
  const { session } = ctx;
  if (!canHrDocumentTypeEdit(session.user)) return errorResponse('Forbidden', 403);

  let companyId = ctx.companyId;
  if (!companyId) {
    companyId = resolveHrWriteCompanyId({
      requestedCompanyId: searchParams.get('companyId'),
      activeCompanyId: ctx.session.user.activeCompanyId,
    });
  }
  if (!companyId || !ctx.companyIds.includes(companyId)) {
    return errorResponse('companyId is required', 400);
  }

  await ensureDefaultEmployeeDocumentTypes(prisma, companyId);
  const list = await prisma.employeeDocumentType.findMany({
    where: { companyId },
    include: { company: { select: companySelect } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  publishLiveUpdate({
    companyId,
    channel: 'hr',
    entity: 'document-type',
    action: 'changed',
  });
  return successResponse(list);
}
