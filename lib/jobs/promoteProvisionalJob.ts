import type { Prisma, PrismaClient } from '@prisma/client';
import { serializeJobWithContacts } from '@/lib/jobs/jobContacts';
import { serializeRequiredExpertises } from '@/lib/jobs/jobRequiredExpertises';

export class PromoteProvisionalJobError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'PromoteProvisionalJobError';
  }
}

function variationNumberAfterParentRename(
  previousParentJobNumber: string,
  nextParentJobNumber: string,
  variationJobNumber: string,
): string | null {
  const prefix = `${previousParentJobNumber.trim()}-`;
  const trimmed = variationJobNumber.trim();
  if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const suffix = trimmed.slice(prefix.length).trim();
  if (!suffix) return null;
  return `${nextParentJobNumber.trim()}-${suffix}`;
}

async function cascadeAssignmentSnapshots(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string;
    jobId: string;
    jobNumber: string;
    customerName: string;
    site: string | null;
  },
) {
  const assignments = await tx.workAssignment.findMany({
    where: { companyId: params.companyId, jobId: params.jobId },
    select: { id: true, locationType: true },
  });

  for (const assignment of assignments) {
    const patch: Prisma.WorkAssignmentUpdateInput = {
      jobNumberSnapshot: params.jobNumber,
    };
    if (assignment.locationType === 'SITE_JOB') {
      patch.clientNameSnapshot = params.customerName;
      if (params.site?.trim()) {
        patch.siteNameSnapshot = params.site.trim();
      }
    }
    await tx.workAssignment.update({
      where: { id: assignment.id },
      data: patch,
    });
  }

  return assignments.length;
}

export async function promoteProvisionalJob(
  prisma: PrismaClient,
  params: {
    companyId: string;
    jobId: string;
    userId: string;
    jobNumber: string;
    customerId: string;
    note?: string | null;
  },
) {
  const trimmedNumber = params.jobNumber.trim();
  if (!trimmedNumber) {
    throw new PromoteProvisionalJobError('Job number is required', 422);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.job.findFirst({
      where: { companyId: params.companyId, id: params.jobId },
      select: {
        id: true,
        jobNumber: true,
        customerId: true,
        parentJobId: true,
        site: true,
        source: true,
        isProvisional: true,
      },
    });
    if (!existing) {
      throw new PromoteProvisionalJobError('Job not found', 404);
    }
    if (existing.parentJobId) {
      throw new PromoteProvisionalJobError(
        'Confirm the parent job number instead; variation numbers update automatically.',
        422,
      );
    }
    if (existing.source === 'EXTERNAL_API') {
      throw new PromoteProvisionalJobError('Externally synced jobs cannot be renumbered in AMFGI', 403);
    }

    const customer = await tx.customer.findFirst({
      where: { companyId: params.companyId, id: params.customerId },
      select: { id: true, name: true },
    });
    if (!customer) {
      throw new PromoteProvisionalJobError('Customer not found', 404);
    }

    const numberUnchanged = trimmedNumber.toLowerCase() === existing.jobNumber.trim().toLowerCase();
    const customerUnchanged = customer.id === existing.customerId;

    if (!existing.isProvisional && numberUnchanged && customerUnchanged) {
      throw new PromoteProvisionalJobError('No changes to confirm', 422);
    }

    const variations = await tx.job.findMany({
      where: { companyId: params.companyId, parentJobId: existing.id },
      select: { id: true, jobNumber: true, source: true },
      orderBy: { jobNumber: 'asc' },
    });

    const previousJobNumber = existing.jobNumber;
    const previousCustomerId = existing.customerId;
    const variationUpdates = variations
      .map((variation) => {
        if (variation.source === 'EXTERNAL_API') return null;
        const nextJobNumber = numberUnchanged
          ? null
          : variationNumberAfterParentRename(previousJobNumber, trimmedNumber, variation.jobNumber);
        if (!nextJobNumber || nextJobNumber.toLowerCase() === variation.jobNumber.trim().toLowerCase()) {
          return customerUnchanged
            ? null
            : {
                id: variation.id,
                previousJobNumber: variation.jobNumber,
                newJobNumber: variation.jobNumber,
              };
        }
        return {
          id: variation.id,
          previousJobNumber: variation.jobNumber,
          newJobNumber: nextJobNumber,
        };
      })
      .filter((row): row is { id: string; previousJobNumber: string; newJobNumber: string } => row !== null);

    const reservedNumbers = new Set<string>();
    const checkUnique = async (jobNumber: string, allowedIds: string[]) => {
      const key = jobNumber.trim().toLowerCase();
      if (reservedNumbers.has(key)) {
        throw new PromoteProvisionalJobError(`Job number already in use: ${jobNumber}`, 409);
      }
      reservedNumbers.add(key);
      const duplicate = await tx.job.findFirst({
        where: {
          companyId: params.companyId,
          jobNumber: jobNumber.trim(),
          NOT: { id: { in: allowedIds } },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new PromoteProvisionalJobError('Job number already exists for this company', 409);
      }
    };

    const touchedJobIds = [existing.id, ...variationUpdates.map((row) => row.id)];
    if (!numberUnchanged) {
      await checkUnique(trimmedNumber, touchedJobIds);
    }
    for (const variationUpdate of variationUpdates) {
      if (variationUpdate.newJobNumber !== variationUpdate.previousJobNumber) {
        await checkUnique(variationUpdate.newJobNumber, touchedJobIds);
      }
    }

    const now = new Date();

    const updated = await tx.job.update({
      where: { id: existing.id },
      data: {
        jobNumber: trimmedNumber,
        customerId: customer.id,
        isProvisional: false,
        confirmedAt: now,
      },
      include: {
        contacts: { orderBy: { sortOrder: 'asc' } },
        requiredExpertiseLinks: {
          orderBy: { sortOrder: 'asc' },
          select: {
            sortOrder: true,
            expertise: { select: { name: true } },
          },
        },
        customer: { select: { id: true, name: true } },
      },
    });

    let assignmentsUpdated = await cascadeAssignmentSnapshots(tx, {
      companyId: params.companyId,
      jobId: existing.id,
      jobNumber: trimmedNumber,
      customerName: customer.name,
      site: existing.site,
    });

    let variationsUpdated = 0;
    for (const variationUpdate of variationUpdates) {
      const numberChanged =
        variationUpdate.newJobNumber.trim().toLowerCase() !==
        variationUpdate.previousJobNumber.trim().toLowerCase();

      await tx.job.update({
        where: { id: variationUpdate.id },
        data: {
          ...(numberChanged ? { jobNumber: variationUpdate.newJobNumber } : {}),
          customerId: customer.id,
          isProvisional: false,
        },
      });
      variationsUpdated += 1;

      assignmentsUpdated += await cascadeAssignmentSnapshots(tx, {
        companyId: params.companyId,
        jobId: variationUpdate.id,
        jobNumber: variationUpdate.newJobNumber,
        customerName: customer.name,
        site: existing.site,
      });

      if (numberChanged || !customerUnchanged) {
        await tx.jobNumberHistory.create({
          data: {
            companyId: params.companyId,
            jobId: variationUpdate.id,
            previousJobNumber: variationUpdate.previousJobNumber,
            newJobNumber: variationUpdate.newJobNumber,
            previousCustomerId,
            newCustomerId: customer.id,
            changedBy: params.userId,
            note: params.note?.trim()
              ? `Renumbered with parent ${previousJobNumber} → ${trimmedNumber}. ${params.note.trim()}`
              : `Renumbered with parent ${previousJobNumber} → ${trimmedNumber}`,
          },
        });
      }
    }

    if (!numberUnchanged || !customerUnchanged) {
      await tx.jobNumberHistory.create({
        data: {
          companyId: params.companyId,
          jobId: existing.id,
          previousJobNumber,
          newJobNumber: trimmedNumber,
          previousCustomerId,
          newCustomerId: customer.id,
          changedBy: params.userId,
          note: params.note?.trim() || null,
        },
      });
    }

    return {
      job: {
        ...serializeRequiredExpertises(serializeJobWithContacts(updated)),
        customerName: updated.customer?.name ?? null,
      },
      assignmentsUpdated,
      variationsUpdated,
      affectedJobIds: [existing.id, ...variationUpdates.map((row) => row.id)],
    };
  });
}
