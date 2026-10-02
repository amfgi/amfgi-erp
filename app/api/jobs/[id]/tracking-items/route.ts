import { auth } from '@/auth';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { resolveJobBudgetContext } from '@/lib/job-costing/budgetJobContext';
import { buildTrackingOnlySpecifications } from '@/lib/job-costing/trackingOnlyBudget';
import { syncTrackedJobItemProgress } from '@/lib/job-costing/jobItemProgressTracking';
import { canEditJobBudgetJobsApi } from '@/lib/permissions/stockModuleAccess';
import { canEditProductionLog } from '@/lib/permissions/stockModuleAccess';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const BodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().max(40).optional().nullable(),
  /** Blank or 0 means open-ended. Extra quantity is allowed. */
  targetValue: z.number().min(0).optional().nullable(),
  workDate: z.string().min(1).optional(),
});

/** Create a quantity-only job line when no formula or material budget exists yet. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const perms = session.user.permissions;
  const isSuperAdmin = session.user.isSuperAdmin;
  if (!canEditProductionLog(perms, isSuperAdmin) && !canEditJobBudgetJobsApi(perms, isSuperAdmin)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id } = await params;
  const budgetCtx = await resolveJobBudgetContext(prisma, companyId, id);
  if (!budgetCtx) return errorResponse('Job not found', 404);

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  if (parsed.data.workDate) {
    let workDateYmd: string;
    try {
      workDateYmd = ymdFromInput(parsed.data.workDate);
    } catch {
      return errorResponse('Invalid workDate', 400);
    }
    const locked = await prisma.quantityLogDaySubmission.findUnique({
      where: { companyId_workDate: { companyId, workDate: dateFromYmd(workDateYmd) } },
      select: { id: true },
    });
    if (locked) return errorResponse('This day is finalized. Unlock it before adding a tracking item.', 403);
  }

  const name = parsed.data.name;
  const unit = parsed.data.unit?.trim() || null;
  const targetValue = parsed.data.targetValue ?? 0;
  const trackerId = randomUUID();
  const lastItem = await prisma.jobItem.findFirst({
    where: { companyId, jobId: budgetCtx.budgetJobId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.jobItem.create({
      data: {
        id: randomUUID(),
        companyId,
        jobId: budgetCtx.budgetJobId,
        createdBy: session.user.id,
        name,
        description: null,
        formulaLibraryId: null,
        specifications: buildTrackingOnlySpecifications() as Prisma.InputJsonValue,
        sortOrder: (lastItem?.sortOrder ?? 0) + 1,
        trackingEnabled: true,
        trackingItems: [
          {
            id: trackerId,
            label: name,
            unit,
            targetValue,
          },
        ] as Prisma.InputJsonValue,
        trackingLabel: name,
        trackingUnit: unit,
        trackingTargetValue: targetValue,
        updatedAt: new Date(),
      },
    });
    await syncTrackedJobItemProgress(tx, companyId, created.id);
    return created;
  });

  return successResponse(
    {
      id: item.id,
      jobId: item.jobId,
      name: item.name,
      trackingEnabled: item.trackingEnabled,
    },
    201
  );
}
