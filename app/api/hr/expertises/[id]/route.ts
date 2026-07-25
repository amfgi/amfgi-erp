import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { companyIdWhere, hasPerm, requireHrSession } from '@/lib/hr/requireHrSession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';
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
  const existing = await prisma.workforceExpertise.findFirst({
    where: { id, ...companyIdWhere(companyIds) },
  });
  if (!existing) return errorResponse('Not found', 404);
  const companyId = existing.companyId;

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const data: Prisma.WorkforceExpertiseUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

  try {
    const row = await prisma.workforceExpertise.update({ where: { id }, data });
    publishLiveUpdate({
      companyId,
      channel: 'hr',
      entity: 'expertise',
      action: 'updated',
    });
    return successResponse(row);
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return errorResponse('Expertise already exists', 409);
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
  const existing = await prisma.workforceExpertise.findFirst({
    where: { id, ...companyIdWhere(companyIds) },
  });
  if (!existing) return errorResponse('Not found', 404);
  const companyId = existing.companyId;
  const name = existing.name.trim();

  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, profileExtension: true },
  });
  const employeeLinked = employees.some((e) =>
    parseWorkforceProfile(e.profileExtension).expertises.some((x) => x.toLowerCase() === name.toLowerCase())
  );
  if (employeeLinked) {
    return errorResponse('Cannot delete: expertise is linked to one or more employees.', 409);
  }

  const jobLinkedCount = await prisma.jobRequiredExpertise.count({
    where: {
      companyId,
      expertiseId: id,
    },
  });
  if (jobLinkedCount > 0) {
    return errorResponse('Cannot delete: expertise is linked to one or more jobs.', 409);
  }

  await prisma.workforceExpertise.delete({ where: { id } });
  publishLiveUpdate({
    companyId,
    channel: 'hr',
    entity: 'expertise',
    action: 'deleted',
  });
  return successResponse({ ok: true });
}
