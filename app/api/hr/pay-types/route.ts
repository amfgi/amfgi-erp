import { auth } from '@/auth';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { parsePayTypeConfig } from '@/lib/hr/payroll/parsePayTypeConfig';
import { ensureDefaultPayTypes } from '@/lib/hr/payroll/seedPayTypes';
import { canHrPayrollCatalogRead } from '@/lib/hr/compensationPermissions';
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

const CreateSchema = z.object({
  companyId: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(60).regex(/^[A-Z0-9_]+$/i),
  config: z.record(z.string(), z.unknown()),
  sortOrder: z.number().int().optional(),
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
    await ensureDefaultPayTypes(prisma, companyId);
  }

  const rows = await prisma.payType.findMany({
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

  try {
    parsePayTypeConfig(parsed.data.config);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Invalid pay type config', 422);
  }

  const code = parsed.data.code.trim().toUpperCase();
  const duplicate = await prisma.payType.findFirst({ where: { companyId, code } });
  if (duplicate) return errorResponse(`Pay type code "${code}" already exists`, 409);

  const row = await prisma.payType.create({
    data: {
      companyId,
      name: parsed.data.name.trim(),
      code,
      config: parsed.data.config as Prisma.InputJsonValue,
      sortOrder: parsed.data.sortOrder ?? 100,
      isSystem: false,
    },
    include: { company: { select: companySelect } },
  });
  return successResponse(row, 201);
}
