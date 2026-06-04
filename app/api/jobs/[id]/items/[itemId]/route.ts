import { auth } from '@/auth';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { resolveJobBudgetContext } from '@/lib/job-costing/budgetJobContext';
import {
  canEditJobBudgetJobsApi,
  canViewJobBudgetJobsApi,
} from '@/lib/permissions/stockModuleAccess';
import { syncTrackedJobItemProgress } from '@/lib/job-costing/jobItemProgressTracking';
import {
  attachTrackableMaterialLinks,
  cleanTrackableItemsForStorage,
  syncTrackableMaterialLinks,
} from '@/lib/job-costing/trackableMaterialLinks';
import {
  assertCompanyEmployeesExist,
  normalizeAssignedEmployeeIds,
  serializeAssignedEmployeeIds,
} from '@/lib/job-costing/jobItemAssignments';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import {
  JobItemUpdateSchema,
  normalizeJobItemUpdatePayload,
} from '@/lib/job-costing/jobItemApiValidation';

async function loadJobItem(companyId: string, routeJobId: string, itemId: string) {
  const ctx = await resolveJobBudgetContext(prisma, companyId, routeJobId);
  if (!ctx) return null;
  return prisma.jobItem.findFirst({
    where: {
      id: itemId,
      jobId: ctx.budgetJobId,
      companyId,
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canViewJobBudgetJobsApi(session.user.permissions, session.user.isSuperAdmin)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id, itemId } = await params;
  const budgetCtx = await resolveJobBudgetContext(prisma, companyId, id);
  if (!budgetCtx) return errorResponse('Job not found', 404);
  const row = await prisma.jobItem.findFirst({
    where: {
      id: itemId,
      jobId: budgetCtx.budgetJobId,
      companyId,
    },
    include: {
      assignedEmployees: {
        orderBy: { sortOrder: 'asc' },
        select: {
          employeeId: true,
          sortOrder: true,
        },
      },
      formulaLibrary: true,
    },
  });
  if (!row) return errorResponse('Job item not found', 404);
  const [rowWithLinks] = await attachTrackableMaterialLinks(prisma, companyId, [row]);
  return successResponse(serializeAssignedEmployeeIds(rowWithLinks ?? row));
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canEditJobBudgetJobsApi(session.user.permissions, session.user.isSuperAdmin)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id, itemId } = await params;
  const existing = await loadJobItem(companyId, id, itemId);
  if (!existing) return errorResponse('Job item not found', 404);

  const body = await req.json();
  const parsed = JobItemUpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const payload = normalizeJobItemUpdatePayload(
    { formulaLibraryId: existing.formulaLibraryId, specifications: existing.specifications },
    parsed.data
  );
  const { assignedEmployeeIds: assignedEmployeeIdsInput, ...jobItemData } = payload;
  const trackingItemsForStorage = cleanTrackableItemsForStorage(jobItemData.trackingItems);

  if (jobItemData.formulaLibraryId) {
    const formula = await prisma.formulaLibrary.findFirst({
      where: {
        id: jobItemData.formulaLibraryId,
        companyId,
        isActive: true,
      },
    });
    if (!formula) return errorResponse('Formula library item not found for this company', 404);
  }

  const assignedEmployeeIds =
    assignedEmployeeIdsInput === undefined
      ? undefined
      : normalizeAssignedEmployeeIds(assignedEmployeeIdsInput);
  if (assignedEmployeeIds) {
    const employeesExist = await assertCompanyEmployeesExist(companyId, assignedEmployeeIds);
    if (!employeesExist) return errorResponse('Assigned employee not found for this company', 422);
  }

  try {
    const row = await prisma.$transaction(async (tx) => {
      await tx.jobItem.update({
        where: { id: itemId },
        data: {
          ...jobItemData,
          plannedStartDate:
            jobItemData.plannedStartDate === undefined
              ? undefined
              : (jobItemData.plannedStartDate ? new Date(jobItemData.plannedStartDate) : null),
          plannedEndDate:
            jobItemData.plannedEndDate === undefined
              ? undefined
              : (jobItemData.plannedEndDate ? new Date(jobItemData.plannedEndDate) : null),
          actualStartDate:
            jobItemData.actualStartDate === undefined
              ? undefined
              : (jobItemData.actualStartDate ? new Date(jobItemData.actualStartDate) : null),
          actualEndDate:
            jobItemData.actualEndDate === undefined
              ? undefined
              : (jobItemData.actualEndDate ? new Date(jobItemData.actualEndDate) : null),
          progressUpdatedAt:
            jobItemData.progressStatus !== undefined ||
            jobItemData.progressPercent !== undefined ||
            jobItemData.trackingItems !== undefined ||
            jobItemData.trackingEnabled !== undefined ||
            jobItemData.trackingLabel !== undefined ||
            jobItemData.trackingUnit !== undefined ||
            jobItemData.trackingTargetValue !== undefined ||
            jobItemData.trackingSourceKey !== undefined ||
            jobItemData.plannedStartDate !== undefined ||
            jobItemData.plannedEndDate !== undefined ||
            jobItemData.actualStartDate !== undefined ||
            jobItemData.actualEndDate !== undefined ||
            jobItemData.progressNote !== undefined
              ? new Date()
              : undefined,
          specifications:
            jobItemData.specifications === undefined
              ? undefined
              : (jobItemData.specifications as Prisma.InputJsonValue),
          trackingItems:
            jobItemData.trackingItems === undefined
              ? undefined
              : (trackingItemsForStorage as Prisma.InputJsonValue),
        } satisfies Prisma.JobItemUncheckedUpdateInput,
      });

      if (assignedEmployeeIds !== undefined) {
        await tx.jobItemAssignment.deleteMany({
          where: {
            companyId,
            jobItemId: itemId,
          },
        });
        if (assignedEmployeeIds.length > 0) {
          await tx.jobItemAssignment.createMany({
            data: assignedEmployeeIds.map((employeeId, index) => ({
              id: randomUUID(),
              companyId,
              jobItemId: itemId,
              employeeId,
              sortOrder: index,
              updatedAt: new Date(),
            })),
          });
        }
      }

      if (jobItemData.trackingItems !== undefined) {
        await syncTrackableMaterialLinks(tx, companyId, itemId, jobItemData.trackingItems);
      }

      if (jobItemData.trackingEnabled === true || existing.trackingEnabled) {
        await syncTrackedJobItemProgress(tx, companyId, itemId);
      }

      return tx.jobItem.findFirstOrThrow({
        where: {
          id: itemId,
          companyId,
        },
        include: {
          assignedEmployees: {
            orderBy: { sortOrder: 'asc' },
            select: {
              employeeId: true,
              sortOrder: true,
            },
          },
          formulaLibrary: true,
        },
      });
    });

    const [rowWithLinks] = await attachTrackableMaterialLinks(prisma, companyId, [row]);
    return successResponse(serializeAssignedEmployeeIds(rowWithLinks ?? row));
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to update job item', 409);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canEditJobBudgetJobsApi(session.user.permissions, session.user.isSuperAdmin)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id, itemId } = await params;
  const existing = await loadJobItem(companyId, id, itemId);
  if (!existing) return errorResponse('Job item not found', 404);

  await prisma.jobItem.delete({ where: { id: itemId } });
  return successResponse({ deleted: true });
}
