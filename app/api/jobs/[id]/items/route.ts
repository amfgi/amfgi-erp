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
  JobItemCreateSchema,
  normalizeJobItemCreatePayload,
} from '@/lib/job-costing/jobItemApiValidation';

async function loadVariationJob(jobId: string, companyId: string) {
  return prisma.job.findFirst({
    where: {
      id: jobId,
      companyId,
    },
    select: {
      id: true,
      parentJobId: true,
      companyId: true,
      jobNumber: true,
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canViewJobBudgetJobsApi(session.user.permissions, session.user.isSuperAdmin)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id } = await params;
  const job = await loadVariationJob(id, companyId);
  if (!job) return errorResponse('Job not found', 404);

  const budgetCtx = await resolveJobBudgetContext(prisma, companyId, id);
  if (!budgetCtx) return errorResponse('Job not found', 404);

  const rows = await prisma.jobItem.findMany({
    where: {
      companyId,
      jobId: budgetCtx.budgetJobId,
      isActive: true,
    },
    include: {
      assignedEmployees: {
        orderBy: { sortOrder: 'asc' },
        select: {
          employeeId: true,
          sortOrder: true,
        },
      },
      formulaLibrary: {
        select: {
          id: true,
          name: true,
          slug: true,
          fabricationType: true,
          formulaConfig: true,
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const itemsWithLinks = await attachTrackableMaterialLinks(prisma, companyId, rows);

  return successResponse({
    job,
    items: itemsWithLinks.map(serializeAssignedEmployeeIds),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canEditJobBudgetJobsApi(session.user.permissions, session.user.isSuperAdmin)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id } = await params;
  const job = await loadVariationJob(id, companyId);
  if (!job) return errorResponse('Job not found', 404);
  if (job.parentJobId) {
    return errorResponse(
      'Material budget lines are stored on the parent contract job. Open the parent job to add or edit budget items.',
      422
    );
  }

  const body = await req.json();
  const parsed = JobItemCreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const payload = normalizeJobItemCreatePayload(parsed.data);
  const trackingItemsForStorage = cleanTrackableItemsForStorage(payload.trackingItems);

  if (payload.formulaLibraryId) {
    const formula = await prisma.formulaLibrary.findFirst({
      where: {
        id: payload.formulaLibraryId,
        companyId,
        isActive: true,
      },
    });
    if (!formula) return errorResponse('Formula library item not found for this company', 404);
  }

  const assignedEmployeeIds = normalizeAssignedEmployeeIds(payload.assignedEmployeeIds);
  const employeesExist = await assertCompanyEmployeesExist(companyId, assignedEmployeeIds);
  if (!employeesExist) return errorResponse('Assigned employee not found for this company', 422);

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.jobItem.create({
      data: {
        id: randomUUID(),
        companyId,
        jobId: job.id,
        createdBy: session.user.id,
        name: payload.name,
        description: payload.description ?? null,
        formulaLibraryId: payload.formulaLibraryId,
        specifications: payload.specifications as Prisma.InputJsonValue,
        sortOrder: payload.sortOrder ?? 0,
        progressStatus: payload.progressStatus ?? 'NOT_STARTED',
        progressPercent: payload.progressPercent ?? 0,
        trackingItems: trackingItemsForStorage as Prisma.InputJsonValue | undefined,
        trackingEnabled: payload.trackingEnabled ?? false,
        trackingLabel: payload.trackingLabel?.trim() || null,
        trackingUnit: payload.trackingUnit?.trim() || null,
        trackingTargetValue: payload.trackingTargetValue ?? null,
        trackingSourceKey: payload.trackingSourceKey?.trim() || null,
        plannedStartDate: payload.plannedStartDate ? new Date(payload.plannedStartDate) : null,
        plannedEndDate: payload.plannedEndDate ? new Date(payload.plannedEndDate) : null,
        actualStartDate: payload.actualStartDate ? new Date(payload.actualStartDate) : null,
        actualEndDate: payload.actualEndDate ? new Date(payload.actualEndDate) : null,
        progressNote: payload.progressNote ?? null,
        progressUpdatedAt: payload.progressStatus !== undefined || payload.progressPercent !== undefined || payload.plannedStartDate !== undefined || payload.plannedEndDate !== undefined || payload.actualStartDate !== undefined || payload.actualEndDate !== undefined || payload.progressNote !== undefined ? new Date() : null,
        updatedAt: new Date(),
      },
    });

    if (assignedEmployeeIds.length > 0) {
      await tx.jobItemAssignment.createMany({
        data: assignedEmployeeIds.map((employeeId, index) => ({
          companyId,
          id: randomUUID(),
          jobItemId: created.id,
          employeeId,
          sortOrder: index,
          updatedAt: new Date(),
        })),
      });
    }

    await syncTrackableMaterialLinks(tx, companyId, created.id, payload.trackingItems ?? []);

    if (payload.trackingEnabled) {
      await syncTrackedJobItemProgress(tx, companyId, created.id);
    }

    return tx.jobItem.findFirstOrThrow({
      where: {
        id: created.id,
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
        formulaLibrary: {
          select: {
            id: true,
            name: true,
            slug: true,
            fabricationType: true,
            formulaConfig: true,
          },
        },
      },
    });
  });

  const [itemWithLinks] = await attachTrackableMaterialLinks(prisma, companyId, [item]);
  return successResponse(serializeAssignedEmployeeIds(itemWithLinks ?? item), 201);
}
