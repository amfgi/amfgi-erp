import type { PrismaClient } from '@prisma/client';

type JobListLineageInput = {
  id: string;
  parentJobId: string | null;
  jobNumber?: string;
};

export type JobListLineageFields = {
  parentJobNumber?: string | null;
  variationCount?: number;
};

export async function attachJobListLineage<T extends JobListLineageInput>(
  prisma: Pick<PrismaClient, 'job'>,
  companyId: string,
  jobs: T[],
): Promise<Array<T & JobListLineageFields>> {
  if (jobs.length === 0) return jobs;

  const parentIdsOnPage = jobs.filter((job) => !job.parentJobId).map((job) => job.id);
  const parentIdsFromVariations = [
    ...new Set(
      jobs
        .map((job) => job.parentJobId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [parentRows, variationCounts] = await Promise.all([
    parentIdsFromVariations.length > 0
      ? prisma.job.findMany({
          where: { companyId, id: { in: parentIdsFromVariations } },
          select: { id: true, jobNumber: true },
        })
      : Promise.resolve([]),
    parentIdsOnPage.length > 0
      ? prisma.job.groupBy({
          by: ['parentJobId'],
          where: {
            companyId,
            parentJobId: { in: parentIdsOnPage },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const parentNumberById = new Map(parentRows.map((row) => [row.id, row.jobNumber]));
  for (const job of jobs) {
    if (!job.parentJobId && job.jobNumber) {
      parentNumberById.set(job.id, job.jobNumber);
    }
  }

  const variationCountByParentId = new Map(
    variationCounts.map((row) => [row.parentJobId!, row._count._all]),
  );

  return jobs.map((job) => {
    if (job.parentJobId) {
      return {
        ...job,
        parentJobNumber: parentNumberById.get(job.parentJobId) ?? null,
      };
    }
    return {
      ...job,
      variationCount: variationCountByParentId.get(job.id) ?? 0,
    };
  });
}
