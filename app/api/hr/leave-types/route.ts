import { prisma } from '@/lib/db/prisma';
import { LeaveTypeRulesSchema } from '@/lib/hr/leaveTypeRules';
import { ensureLeaveTypesReady } from '@/lib/hr/seedLeaveTypes';
import { P } from '@/lib/permissions';
import { requireHrSession, resolveHrWriteCompanyId } from '@/lib/hr/requireHrSession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const companySelect = { id: true, name: true, slug: true } as const;

const CreateSchema = z.object({
  companyId: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(60).regex(/^[A-Z0-9_]+$/i),
  description: z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  rules: LeaveTypeRulesSchema.optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const permOrder = [P.HR_PAYROLL_SETTINGS, P.HR_ATTENDANCE_VIEW, P.HR_ATTENDANCE_EDIT];

  let ctx: Awaited<ReturnType<typeof requireHrSession>> | null = null;
  for (const permission of permOrder) {
    const attempt = await requireHrSession({
      permission,
      companyId: searchParams.get('companyId'),
    });
    ctx = attempt;
    if (attempt.ok) break;
  }
  if (!ctx?.ok) return ctx?.response ?? errorResponse('Forbidden', 403);

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

  await ensureLeaveTypesReady(prisma, companyId);

  const rows = await prisma.leaveType.findMany({
    where: { companyId },
    include: { company: { select: companySelect } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return successResponse(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const ctx = await requireHrSession({ permission: P.HR_PAYROLL_SETTINGS });
  if (!ctx.ok) return ctx.response;

  const companyId = resolveHrWriteCompanyId({
    requestedCompanyId: parsed.data.companyId,
    activeCompanyId: ctx.session.user.activeCompanyId,
  });
  if (!companyId || !ctx.companyIds.includes(companyId)) {
    return errorResponse('companyId is required', 400);
  }

  const code = parsed.data.code.trim().toUpperCase();
  const duplicate = await prisma.leaveType.findFirst({ where: { companyId, code } });
  if (duplicate) return errorResponse(`Leave type code "${code}" already exists`, 409);

  const row = await prisma.leaveType.create({
    data: {
      companyId,
      name: parsed.data.name.trim(),
      code,
      description: parsed.data.description?.trim() || null,
      sortOrder: parsed.data.sortOrder ?? 100,
      isActive: parsed.data.isActive ?? true,
      rules: parsed.data.rules ?? {},
    },
    include: { company: { select: companySelect } },
  });
  return successResponse(row, 201);
}
