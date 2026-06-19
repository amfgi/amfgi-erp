import { attachJobListLineage } from '@/lib/jobs/jobListLineage';

function createMockPrisma(options: {
  parents?: Array<{ id: string; jobNumber: string }>;
  variationCounts?: Array<{ parentJobId: string; count: number }>;
}) {
  return {
    job: {
      findMany: jest.fn(async () => options.parents ?? []),
      groupBy: jest.fn(async () =>
        (options.variationCounts ?? []).map((row) => ({
          parentJobId: row.parentJobId,
          _count: { _all: row.count },
        })),
      ),
    },
  };
}

describe('attachJobListLineage', () => {
  it('adds parent job number for variations not on the same page', async () => {
    const prisma = createMockPrisma({
      parents: [{ id: 'parent-1', jobNumber: 'JOB-1001' }],
    });

    const [result] = await attachJobListLineage(
      prisma as never,
      'co-1',
      [{ id: 'var-1', parentJobId: 'parent-1', jobNumber: 'JOB-1001-1' }],
    );

    expect(result.parentJobNumber).toBe('JOB-1001');
    expect(prisma.job.findMany).toHaveBeenCalled();
  });

  it('adds total variation count for parent jobs from the database', async () => {
    const prisma = createMockPrisma({
      variationCounts: [{ parentJobId: 'parent-1', count: 4 }],
    });

    const [result] = await attachJobListLineage(
      prisma as never,
      'co-1',
      [{ id: 'parent-1', parentJobId: null, jobNumber: 'JOB-1001' }],
    );

    expect(result.variationCount).toBe(4);
    expect(prisma.job.groupBy).toHaveBeenCalled();
  });
});
