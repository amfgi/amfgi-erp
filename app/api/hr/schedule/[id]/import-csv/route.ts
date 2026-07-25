import { prisma } from '@/lib/db/prisma';
import { runScheduleCsvImport } from '@/lib/hr/runScheduleCsvImport';
import { P } from '@/lib/permissions';
import { companyIdWhere, requireHrSession } from '@/lib/hr/requireHrSession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const BodySchema = z.object({
  csvText: z.string().min(10),
  workDateYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_SCHEDULE_EDIT });
  if (!ctx.ok) return ctx.response;
  const { companyIds } = ctx;
  const { id: scheduleId } = await params;

  const sch = await prisma.workSchedule.findFirst({
    where: { id: scheduleId, ...companyIdWhere(companyIds) },
    select: { id: true, companyId: true },
  });
  if (!sch) return errorResponse('Not found', 404);
  const companyId = sch.companyId;

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const result = await runScheduleCsvImport(prisma, {
    companyId,
    scheduleId,
    csvText: parsed.data.csvText,
    workDateYmdOverride: parsed.data.workDateYmd,
  });

  if (result.error === 'NOT_FOUND') return errorResponse('Not found', 404);
  if (result.error === 'LOCKED') return errorResponse('Schedule is locked', 403);
  if (result.error === 'PARSE') return errorResponse(result.message ?? 'CSV parse failed', 422);
  if (result.error === 'DATE_MISMATCH') return errorResponse('CSV date does not match this schedule work date', 422);

  return successResponse({ schedule: result.schedule, warnings: result.warnings });
}
