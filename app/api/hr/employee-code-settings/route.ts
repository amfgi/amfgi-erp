import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '@/lib/db/prisma';
import { allocateNextEmployeeCode } from '@/lib/hr/allocateEmployeeCode';
import {
  EMPLOYEE_CODE_COUNTING_STYLES,
  normalizeEmployeeCodeSettings,
  previewEmployeeCodeExample,
  readEmployeeCodeSettingsFromCompanyData,
} from '@/lib/hr/employeeCodeSettings';
import {
  hasPerm,
  requireHrSession,
  resolveHrWriteCompanyId,
} from '@/lib/hr/requireHrSession';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

const BodySchema = z.object({
  companyId: z.string().min(1).optional(),
  prefix: z.string().min(1).max(40),
  separator: z.string().max(1),
  padLength: z.number().int().min(1).max(12),
  countingStyle: z.enum(EMPLOYEE_CODE_COUNTING_STYLES),
  startFrom: z.number().int().min(1).max(1_000_000_000),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filterCompanyId = searchParams.get('companyId');

  if (!filterCompanyId) {
    return errorResponse('companyId is required', 400);
  }

  const ctx = await requireHrSession({
    permission: P.HR_EMPLOYEE_VIEW,
    companyId: filterCompanyId,
  });
  if (!ctx.ok) return ctx.response;
  if (!hasPerm(ctx.session.user, P.HR_EMPLOYEE_VIEW) && !hasPerm(ctx.session.user, P.HR_EMPLOYEE_EDIT)) {
    return errorResponse('Forbidden', 403);
  }
  if (!ctx.companyId) return errorResponse('companyId is required', 400);

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { hrEmployeeCodeSettings: true },
  });
  if (!company) return errorResponse('Company not found', 404);

  const settings = readEmployeeCodeSettingsFromCompanyData(company);
  const { code: nextCodePreview } = await allocateNextEmployeeCode(prisma, ctx.companyId);

  return successResponse({
    settings,
    exampleCode: previewEmployeeCodeExample(settings),
    nextCodePreview,
  });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const authCtx = await requireHrSession({ permission: P.HR_EMPLOYEE_EDIT });
  if (!authCtx.ok) return authCtx.response;
  if (!hasPerm(authCtx.session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);

  const writeCompanyId = resolveHrWriteCompanyId({
    requestedCompanyId: parsed.data.companyId,
    activeCompanyId: authCtx.session.user.activeCompanyId,
  });
  if (!writeCompanyId) return errorResponse('companyId is required', 400);
  if (!authCtx.companyIds.includes(writeCompanyId)) return errorResponse('Forbidden', 403);

  const settings = normalizeEmployeeCodeSettings({
    prefix: parsed.data.prefix,
    separator: parsed.data.separator,
    padLength: parsed.data.padLength,
    countingStyle: parsed.data.countingStyle,
    startFrom: parsed.data.startFrom,
  });

  await prisma.company.update({
    where: { id: writeCompanyId },
    data: {
      hrEmployeeCodeSettings: settings as unknown as Prisma.InputJsonValue,
    },
  });

  const { code: nextCodePreview } = await allocateNextEmployeeCode(prisma, writeCompanyId);

  publishLiveUpdate({
    companyId: writeCompanyId,
    channel: 'hr',
    entity: 'employee-code-settings',
    action: 'updated',
  });

  return successResponse({
    settings,
    exampleCode: previewEmployeeCodeExample(settings),
    nextCodePreview,
  });
}
