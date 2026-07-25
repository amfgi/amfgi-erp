import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { ensureDefaultAllowanceTypes } from '@/lib/hr/payroll/seedAllowanceTypes';
import { canHrPayrollCatalogRead } from '@/lib/hr/compensationPermissions';
import { P } from '@/lib/permissions';
import {
  companyIdWhere,
  getHrAccessibleCompanyIds,
  requireHrSession,
  requirePerm,
  resolveHrWriteCompanyId,
} from '@/lib/hr/requireHrSession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import type { Session } from 'next-auth';
import { z } from 'zod';

const companySelect = { id: true, name: true, slug: true } as const;

const ComponentKindSchema = z.enum(['EARNING', 'DEDUCTION']);
const ApplicationModeSchema = z.enum(['FIXED_MONTHLY', 'ATTENDANCE_PRESENT']);

const CreateSchema = z.object({
  companyId: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(60).regex(/^[A-Z0-9_]+$/i),
  description: z.string().max(500).optional().nullable(),
  componentKind: ComponentKindSchema.optional(),
  applicationMode: ApplicationModeSchema.optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

async function payrollCatalogCompanyIds(filter: string | null) {
  const session = (await auth()) as Session | null;
  if (!session?.user) return { ok: false as const, response: errorResponse('Unauthorized', 401) };
  if (!canHrPayrollCatalogRead(session.user)) {
    return { ok: false as const, response: errorResponse('Forbidden', 403) };
  }

  const [settingsIds, compIds] = await Promise.all([
    getHrAccessibleCompanyIds(session.user, P.HR_PAYROLL_SETTINGS),
    getHrAccessibleCompanyIds(session.user, P.HR_COMPENSATION_VIEW),
  ]);
  let companyIds = [...new Set([...settingsIds, ...compIds])];
  if (companyIds.length === 0) return { ok: false as const, response: errorResponse('Forbidden', 403) };

  const trimmed = filter?.trim() || null;
  if (trimmed) {
    if (!companyIds.includes(trimmed)) return { ok: false as const, response: errorResponse('Forbidden', 403) };
    companyIds = [trimmed];
  }

  return { ok: true as const, session, companyIds };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ctx = await payrollCatalogCompanyIds(searchParams.get('companyId'));
  if (!ctx.ok) return ctx.response;
  const { companyIds } = ctx;

  for (const companyId of companyIds) {
    await ensureDefaultAllowanceTypes(prisma, companyId);
  }

  const rows = await prisma.allowanceType.findMany({
    where: companyIdWhere(companyIds),
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { company: { select: companySelect } },
  });
  return successResponse(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const authCtx = await requireHrSession({ permission: P.HR_PAYROLL_SETTINGS });
  if (!authCtx.ok) return authCtx.response;
  const { session } = authCtx;
  if (!requirePerm(session.user, P.HR_PAYROLL_SETTINGS)) return errorResponse('Forbidden', 403);

  const writeCompanyId = resolveHrWriteCompanyId({
    requestedCompanyId: parsed.data.companyId,
    activeCompanyId: session.user.activeCompanyId,
  });
  if (!writeCompanyId) return errorResponse('companyId is required', 400);
  if (!authCtx.companyIds.includes(writeCompanyId)) return errorResponse('Forbidden', 403);
  const companyId = writeCompanyId;

  const code = parsed.data.code.trim().toUpperCase();
  const duplicate = await prisma.allowanceType.findFirst({ where: { companyId, code } });
  if (duplicate) return errorResponse(`Salary component code "${code}" already exists`, 409);

  const row = await prisma.allowanceType.create({
    data: {
      companyId,
      name: parsed.data.name.trim(),
      code,
      description: parsed.data.description?.trim() || null,
      componentKind: parsed.data.componentKind ?? 'EARNING',
      applicationMode: parsed.data.applicationMode ?? 'ATTENDANCE_PRESENT',
      sortOrder: parsed.data.sortOrder ?? 100,
      isActive: parsed.data.isActive ?? true,
    },
    include: { company: { select: companySelect } },
  });
  return successResponse(row, 201);
}
