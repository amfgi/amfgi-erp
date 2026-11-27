import type { Prisma, PrismaClient } from '@prisma/client';

import { cascadeAssignmentSnapshots, variationNumberAfterParentRename } from '@/lib/jobs/promoteProvisionalJob';
import { JOB_NUMBER_MAX_LENGTH, jobSerialNumber, splitJobSerial } from '@/lib/jobs/jobSerial';
import { queryNumberKey } from '@/lib/sales/format';

type Db = Prisma.TransactionClient | PrismaClient;

export class JobSerialError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'JobSerialError';
  }
}

type LoadedJob = {
  id: string;
  jobNumber: string;
  customerId: string;
  parentJobId: string | null;
  site: string | null;
  source: 'LOCAL' | 'EXTERNAL_API';
  customerName: string;
};

type VariationUpdate = {
  id: string;
  previousJobNumber: string;
  newJobNumber: string;
};

type SerialPlan = {
  job: LoadedJob;
  number: string;
  unchanged: boolean;
  available: boolean;
  variationUpdates: VariationUpdate[];
};

function serialTarget(jobNumber: string, serial: string) {
  const parts = splitJobSerial(jobNumber);
  if (!parts) throw new JobSerialError('This job number cannot be changed', 422);
  const number = jobSerialNumber(parts.prefix, serial.trim());
  if (!number) throw new JobSerialError('Enter a serial number', 422);
  return number;
}

async function loadJob(db: Db, companyId: string, id: string): Promise<LoadedJob> {
  const job = await db.job.findFirst({
    where: { companyId, id },
    select: {
      id: true,
      jobNumber: true,
      customerId: true,
      parentJobId: true,
      site: true,
      source: true,
      customer: { select: { name: true } },
    },
  });
  if (!job) throw new JobSerialError('Job not found', 404);
  if (job.parentJobId) throw new JobSerialError('Variation numbers follow the parent job number', 422);
  if (job.source === 'EXTERNAL_API') {
    throw new JobSerialError('Externally synced jobs cannot be renumbered in AMFGI', 403);
  }
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    customerId: job.customerId,
    parentJobId: job.parentJobId,
    site: job.site,
    source: job.source,
    customerName: job.customer?.name ?? '',
  };
}

async function numberTaken(db: Db, companyId: string, jobNumber: string, allowedIds: string[]) {
  const duplicate = await db.job.findFirst({
    where: {
      companyId,
      jobNumber: jobNumber.trim(),
      NOT: { id: { in: allowedIds } },
    },
    select: { id: true },
  });
  return Boolean(duplicate);
}

async function planSerialChange(db: Db, companyId: string, id: string, serial: string): Promise<SerialPlan> {
  const job = await loadJob(db, companyId, id);
  const number = serialTarget(job.jobNumber, serial);
  const variations = await db.job.findMany({
    where: { companyId, parentJobId: job.id },
    select: { id: true, jobNumber: true, source: true },
    orderBy: { jobNumber: 'asc' },
  });

  const variationUpdates: VariationUpdate[] = [];
  for (const variation of variations) {
    if (variation.source === 'EXTERNAL_API') continue;
    const nextJobNumber = variationNumberAfterParentRename(job.jobNumber, number, variation.jobNumber);
    if (!nextJobNumber || nextJobNumber.toLowerCase() === variation.jobNumber.trim().toLowerCase()) continue;
    if (nextJobNumber.length > JOB_NUMBER_MAX_LENGTH) throw new JobSerialError('That serial is too long', 422);
    variationUpdates.push({
      id: variation.id,
      previousJobNumber: variation.jobNumber,
      newJobNumber: nextJobNumber,
    });
  }

  const unchanged = queryNumberKey(number) === queryNumberKey(job.jobNumber);
  if (unchanged) {
    return { job, number, unchanged: true, available: true, variationUpdates: [] };
  }

  const allowedIds = [job.id, ...variationUpdates.map((row) => row.id)];
  const reserved = new Set<string>();
  let available = true;
  for (const candidate of [number, ...variationUpdates.map((row) => row.newJobNumber)]) {
    const key = candidate.trim().toLowerCase();
    if (reserved.has(key) || (await numberTaken(db, companyId, candidate, allowedIds))) {
      available = false;
      break;
    }
    reserved.add(key);
  }

  return { job, number, unchanged: false, available, variationUpdates };
}

export async function checkJobSerial(
  db: Db,
  params: { companyId: string; id: string; serial: string },
) {
  const plan = await planSerialChange(db, params.companyId, params.id, params.serial);
  return { number: plan.number, available: plan.available };
}

export async function changeJobSerial(
  prisma: PrismaClient,
  params: { companyId: string; id: string; userId: string; serial: string },
) {
  return prisma.$transaction(async (tx) => {
    const plan = await planSerialChange(tx, params.companyId, params.id, params.serial);
    if (plan.unchanged) {
      return {
        id: plan.job.id,
        jobNumber: plan.job.jobNumber,
        variationsUpdated: 0,
        assignmentsUpdated: 0,
        affectedJobIds: [plan.job.id],
      };
    }
    if (!plan.available) throw new JobSerialError('Not available, try another', 409);

    await tx.job.update({
      where: { id: plan.job.id },
      data: { jobNumber: plan.number },
    });
    await tx.jobNumberHistory.create({
      data: {
        companyId: params.companyId,
        jobId: plan.job.id,
        previousJobNumber: plan.job.jobNumber,
        newJobNumber: plan.number,
        previousCustomerId: plan.job.customerId,
        newCustomerId: plan.job.customerId,
        changedBy: params.userId,
        note: 'Changed the job serial',
      },
    });

    let assignmentsUpdated = await cascadeAssignmentSnapshots(tx, {
      companyId: params.companyId,
      jobId: plan.job.id,
      jobNumber: plan.number,
      customerName: plan.job.customerName,
      site: plan.job.site,
    });

    for (const variation of plan.variationUpdates) {
      await tx.job.update({
        where: { id: variation.id },
        data: { jobNumber: variation.newJobNumber },
      });
      await tx.jobNumberHistory.create({
        data: {
          companyId: params.companyId,
          jobId: variation.id,
          previousJobNumber: variation.previousJobNumber,
          newJobNumber: variation.newJobNumber,
          previousCustomerId: plan.job.customerId,
          newCustomerId: plan.job.customerId,
          changedBy: params.userId,
          note: `Renumbered with parent ${plan.job.jobNumber} → ${plan.number}`,
        },
      });
      assignmentsUpdated += await cascadeAssignmentSnapshots(tx, {
        companyId: params.companyId,
        jobId: variation.id,
        jobNumber: variation.newJobNumber,
        customerName: plan.job.customerName,
        site: plan.job.site,
      });
    }

    return {
      id: plan.job.id,
      jobNumber: plan.number,
      variationsUpdated: plan.variationUpdates.length,
      assignmentsUpdated,
      affectedJobIds: [plan.job.id, ...plan.variationUpdates.map((row) => row.id)],
    };
  });
}
