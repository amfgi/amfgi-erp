import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '@/lib/db/prisma';
import {
  allocateNextEmployeeCode,
  applyEmployeeCodeRenumber,
  EmployeeCodeClashError,
  loadEmployeeCodeSettings,
  previewEmployeeCodeRenumber,
} from '@/lib/hr/allocateEmployeeCode';
import {
  EMPLOYEE_CODE_COUNTING_STYLES,
  employeeCodePrefixesClash,
  employeeCodeRenumberClash,
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

const RenumberSchema = z.object({
  companyId: z.string().min(1).optional(),
  confirm: z.boolean().optional(),
});

const BodySchema = z.object({
  companyId: z.string().min(1).optional(),
  prefix: z.string().min(1).max(40),
  temporaryPrefix: z.string().max(40).optional(),
  separator: z.string().max(1),
  padLength: z.number().int().min(1).max(12),
  countingStyle: z.enum(EMPLOYEE_CODE_COUNTING_STYLES),
  startFrom: z.number().int().min(1).max(1_000_000_000),
});

async function codePreview(companyId: string, settings: { temporaryPrefix: string }) {
  const { code: nextCodePreview } = await allocateNextEmployeeCode(prisma, companyId);
  const nextTemporaryCodePreview = settings.temporaryPrefix
    ? (await allocateNextEmployeeCode(prisma, companyId, new Date(), 'Temporary')).code
    : null;
  return { nextCodePreview, nextTemporaryCodePreview };
}

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
  const preview = await codePreview(ctx.companyId, settings);

  return successResponse({
    settings,
    exampleCode: previewEmployeeCodeExample(settings),
    ...preview,
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
    temporaryPrefix: parsed.data.temporaryPrefix ?? '',
    separator: parsed.data.separator,
    padLength: parsed.data.padLength,
    countingStyle: parsed.data.countingStyle,
    startFrom: parsed.data.startFrom,
  });
  if (employeeCodePrefixesClash(settings.prefix, settings.temporaryPrefix)) {
    return errorResponse(
      'The temporary prefix must differ from the company prefix, and one must not begin with the other.',
      422,
    );
  }

  await prisma.company.update({
    where: { id: writeCompanyId },
    data: {
      hrEmployeeCodeSettings: settings as unknown as Prisma.InputJsonValue,
    },
  });

  const preview = await codePreview(writeCompanyId, settings);

  publishLiveUpdate({
    companyId: writeCompanyId,
    channel: 'hr',
    entity: 'employee-code-settings',
    action: 'updated',
  });

  return successResponse({
    settings,
    exampleCode: previewEmployeeCodeExample(settings),
    ...preview,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = RenumberSchema.safeParse(body);
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

  if (!parsed.data.confirm) {
    const rows = await previewEmployeeCodeRenumber(prisma, writeCompanyId);
    return successResponse({ rows, applied: false, clash: employeeCodeRenumberClash(rows) });
  }

  let rows;
  try {
    rows = await applyEmployeeCodeRenumber(prisma, writeCompanyId);
  } catch (error) {
    if (error instanceof EmployeeCodeClashError) return errorResponse(error.message, 422);
    throw error;
  }
  const preview = await codePreview(writeCompanyId, await loadEmployeeCodeSettings(prisma, writeCompanyId));

  publishLiveUpdate({
    companyId: writeCompanyId,
    channel: 'hr',
    entity: 'employee',
    action: 'updated',
  });

  return successResponse({ rows, applied: true, ...preview });
}
