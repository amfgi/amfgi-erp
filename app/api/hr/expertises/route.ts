import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import {
  companyIdWhere,
  getHrAccessibleCompanyIds,
  hasPerm,
  requireHrSession,
  resolveHrWriteCompanyId,
} from '@/lib/hr/requireHrSession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import type { Session } from 'next-auth';
import { z } from 'zod';

const companySelect = { id: true, name: true, slug: true } as const;

const CreateSchema = z.object({
  companyId: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

async function expertiseListCompanyIds(filter: string | null) {
  const session = (await auth()) as Session | null;
  if (!session?.user) return { ok: false as const, response: errorResponse('Unauthorized', 401) };
  if (!hasPerm(session.user, P.HR_EMPLOYEE_VIEW) && !hasPerm(session.user, P.HR_EMPLOYEE_EDIT)) {
    return { ok: false as const, response: errorResponse('Forbidden', 403) };
  }

  const [viewIds, editIds] = await Promise.all([
    getHrAccessibleCompanyIds(session.user, P.HR_EMPLOYEE_VIEW),
    getHrAccessibleCompanyIds(session.user, P.HR_EMPLOYEE_EDIT),
  ]);
  let companyIds = [...new Set([...viewIds, ...editIds])];
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
  const ctx = await expertiseListCompanyIds(searchParams.get('companyId'));
  if (!ctx.ok) return ctx.response;
  const { companyIds } = ctx;

  const list = await prisma.workforceExpertise.findMany({
    where: companyIdWhere(companyIds),
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { company: { select: companySelect } },
  });
  return successResponse(list);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const authCtx = await requireHrSession({ permission: P.HR_EMPLOYEE_EDIT });
  if (!authCtx.ok) return authCtx.response;
  const { session } = authCtx;
  if (!hasPerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);

  const writeCompanyId = resolveHrWriteCompanyId({
    requestedCompanyId: parsed.data.companyId,
    activeCompanyId: session.user.activeCompanyId,
  });
  if (!writeCompanyId) return errorResponse('companyId is required', 400);
  if (!authCtx.companyIds.includes(writeCompanyId)) return errorResponse('Forbidden', 403);
  const companyId = writeCompanyId;

  try {
    const row = await prisma.workforceExpertise.create({
      data: {
        companyId,
        name: parsed.data.name.trim(),
        sortOrder: parsed.data.sortOrder ?? 0,
        isActive: parsed.data.isActive ?? true,
      },
      include: { company: { select: companySelect } },
    });
    publishLiveUpdate({
      companyId,
      channel: 'hr',
      entity: 'expertise',
      action: 'created',
    });
    return successResponse(row, 201);
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return errorResponse('Expertise already exists', 409);
    }
    throw e;
  }
}
