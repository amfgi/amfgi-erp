import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { companyIdWhere, hasPerm, requireHrSession } from '@/lib/hr/requireHrSession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_EMPLOYEE_EDIT });
  if (!ctx.ok) return ctx.response;
  const { session, companyIds } = ctx;
  if (!hasPerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const existing = await prisma.employeeMetaOption.findFirst({
    where: { id, ...companyIdWhere(companyIds) },
  });
  if (!existing) return errorResponse('Not found', 404);
  const companyId = existing.companyId;

  try {
    const row = await prisma.employeeMetaOption.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
    });
    publishLiveUpdate({
      companyId,
      channel: 'hr',
      entity: 'employee_meta_option',
      action: 'updated',
    });
    return successResponse(row);
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return errorResponse('Option already exists for this category', 409);
    }
    throw e;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_EMPLOYEE_EDIT });
  if (!ctx.ok) return ctx.response;
  const { session, companyIds } = ctx;
  if (!hasPerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.employeeMetaOption.findFirst({
    where: { id, ...companyIdWhere(companyIds) },
  });
  if (!existing) return errorResponse('Not found', 404);
  const companyId = existing.companyId;

  await prisma.employeeMetaOption.delete({ where: { id } });
  publishLiveUpdate({
    companyId,
    channel: 'hr',
    entity: 'employee_meta_option',
    action: 'deleted',
  });
  return successResponse({ deleted: true });
}
