import { prisma } from '@/lib/db/prisma';
import { canHrCompensationReadVisaPeriods } from '@/lib/hr/compensationPermissions';
import { canHrVisaCreate, canHrVisaView } from '@/lib/hr/visaPermissions';
import { P } from '@/lib/permissions';
import { companyIdWhere, requireHrSession } from '@/lib/hr/requireHrSession';
import { resolveRouteEmployeeId } from '@/lib/hr/resolveRouteEmployeeId';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const VisaSchema = z.object({
  label: z.string().min(1).max(200),
  sponsorType: z.string().max(80).optional().nullable(),
  visaType: z.string().max(80).optional().nullable(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
  notes: z.string().max(5000).optional().nullable(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permOrder = [
    P.HR_VISA_VIEW,
    P.HR_COMPENSATION_CREATE,
    P.HR_COMPENSATION_EDIT,
  ];

  let ctx: Awaited<ReturnType<typeof requireHrSession>> | null = null;
  for (const permission of permOrder) {
    const attempt = await requireHrSession({ permission });
    ctx = attempt;
    if (attempt.ok) break;
  }
  if (!ctx?.ok) return ctx?.response ?? errorResponse('Forbidden', 403);
  const { session, companyIds } = ctx;
  if (!canHrVisaView(session.user) && !canHrCompensationReadVisaPeriods(session.user)) {
    return errorResponse('Forbidden', 403);
  }

  const employeeId = await resolveRouteEmployeeId(req, params);
  if (!employeeId) return errorResponse('Employee id required', 400);

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, ...companyIdWhere(companyIds) },
  });
  if (!emp) return errorResponse('Employee not found', 404);

  const list = await prisma.visaPeriod.findMany({
    where: { employeeId, companyId: emp.companyId },
    orderBy: { endDate: 'desc' },
  });
  return successResponse(list);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_VISA_CREATE });
  if (!ctx.ok) return ctx.response;
  const { session, companyIds } = ctx;
  if (!canHrVisaCreate(session.user)) return errorResponse('Forbidden', 403);

  const employeeId = await resolveRouteEmployeeId(req, params);
  if (!employeeId) return errorResponse('Employee id required', 400);

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, ...companyIdWhere(companyIds) },
  });
  if (!emp) return errorResponse('Employee not found', 404);

  const body = await req.json();
  const parsed = VisaSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const d = parsed.data;

  const row = await prisma.visaPeriod.create({
    data: {
      companyId: emp.companyId,
      employeeId,
      label: d.label.trim(),
      sponsorType: d.sponsorType?.trim() || null,
      visaType: d.visaType?.trim() || null,
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate),
      status: d.status ?? 'DRAFT',
      notes: d.notes?.trim() || null,
    },
  });
  return successResponse(row, 201);
}
