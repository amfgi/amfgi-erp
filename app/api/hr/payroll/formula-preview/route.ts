import { P } from '@/lib/permissions';
import {
  requireHrSession,
  requirePerm,
  resolveHrWriteCompanyId,
} from '@/lib/hr/requireHrSession';
import {
  dummyFormulaPreviewContext,
  employeeFormulaPreviewContext,
} from '@/lib/hr/payroll/buildFormulaPreviewContext';
import { parsePayTypeConfig } from '@/lib/hr/payroll/parsePayTypeConfig';
import { previewPayConfig } from '@/lib/hr/payroll/previewPayConfig';
import type { CompensationInput } from '@/lib/hr/payroll/types';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const BodySchema = z.object({
  companyId: z.string().min(1).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  config: z.record(z.string(), z.unknown()),
  source: z.enum(['dummy', 'employee']),
  scenarioId: z.string().optional(),
  employeeId: z.string().optional(),
  compensationOverride: z
    .object({
      monthlyBasic: z.number().optional(),
      monthlyAllowance: z.number().optional(),
      dailyRate: z.number().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const authCtx = await requireHrSession({ permission: P.HR_PAYROLL_SETTINGS });
  if (!authCtx.ok) return authCtx.response;
  const { session } = authCtx;
  if (!requirePerm(session.user, P.HR_PAYROLL_SETTINGS)) {
    return errorResponse('Forbidden', 403);
  }

  const writeCompanyId = resolveHrWriteCompanyId({
    requestedCompanyId: parsed.data.companyId,
    activeCompanyId: session.user.activeCompanyId,
  });
  if (!writeCompanyId) return errorResponse('companyId is required', 400);
  if (!authCtx.companyIds.includes(writeCompanyId)) return errorResponse('Forbidden', 403);
  const companyId = writeCompanyId;

  let config;
  try {
    config = parsePayTypeConfig(parsed.data.config);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Invalid config', 422);
  }

  const override = parsed.data.compensationOverride as Partial<CompensationInput> | undefined;

  let context;
  if (parsed.data.source === 'employee') {
    if (!parsed.data.employeeId) return errorResponse('employeeId required for employee source', 400);
    context = await employeeFormulaPreviewContext(
      companyId,
      parsed.data.employeeId,
      parsed.data.month,
      override
    );
    if (!context) return errorResponse('Employee not found', 404);
  } else {
    context = dummyFormulaPreviewContext(parsed.data.scenarioId ?? 'office', override);
    if (parsed.data.month) context.month = parsed.data.month;
  }

  const result = previewPayConfig({
    month: context.month,
    config,
    compensation: context.compensation,
    lines: context.lines,
  });

  return successResponse({
    context,
    result,
  });
}
