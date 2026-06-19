import { PromoteProvisionalJobError, promoteProvisionalJob } from '@/lib/jobs/promoteProvisionalJob';

function createMockPrisma(options?: {
  variations?: Array<{ id: string; jobNumber: string; source: 'LOCAL' | 'EXTERNAL_API' }>;
}) {
  const assignments: Array<{ id: string; locationType: string; jobId?: string }> = [];
  const job = {
    id: 'job-1',
    jobNumber: 'TMP-001',
    customerId: 'cust-old',
    parentJobId: null as string | null,
    site: 'Site A',
    source: 'LOCAL' as const,
    isProvisional: true,
  };

  const tx = {
    job: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string; jobNumber?: string } }) => {
        if (where.id === 'job-1') return job;
        if (where.jobNumber === 'REAL-100' || where.jobNumber === 'REAL-100-A') return null;
        return null;
      }),
      findMany: jest.fn(async () => options?.variations ?? []),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (where.id === 'job-1') {
          return {
            ...job,
            jobNumber: data.jobNumber ?? job.jobNumber,
            customerId: data.customerId ?? job.customerId,
            isProvisional: false,
            contacts: [],
            requiredExpertiseLinks: [],
            customer: { id: 'cust-new', name: 'Acme Ltd' },
          };
        }
        return { id: where.id, ...data };
      }),
    },
    customer: {
      findFirst: jest.fn(async () => ({ id: 'cust-new', name: 'Acme Ltd' })),
    },
    workAssignment: {
      findMany: jest.fn(async ({ where }: { where: { jobId?: string } }) =>
        assignments.filter((row) => row.jobId === where.jobId),
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = assignments.find((a) => a.id === where.id);
        if (row) Object.assign(row, data);
      }),
    },
    jobNumberHistory: {
      create: jest.fn(async () => ({})),
    },
  };

  assignments.push({ id: 'asg-1', locationType: 'SITE_JOB', jobId: 'job-1' });

  return {
    $transaction: jest.fn(async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx)),
    tx,
  };
}

describe('promoteProvisionalJob', () => {
  it('updates parent job number, clears provisional flag, and cascades schedule snapshots', async () => {
    const prisma = createMockPrisma();

    const result = await promoteProvisionalJob(prisma as never, {
      companyId: 'co-1',
      jobId: 'job-1',
      userId: 'user-1',
      jobNumber: 'REAL-100',
      customerId: 'cust-new',
      note: 'LPO received',
    });

    expect(result.job.jobNumber).toBe('REAL-100');
    expect(result.assignmentsUpdated).toBe(1);
    expect(result.variationsUpdated).toBe(0);
    expect(prisma.tx.workAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asg-1' },
        data: expect.objectContaining({
          jobNumberSnapshot: 'REAL-100',
          clientNameSnapshot: 'Acme Ltd',
          siteNameSnapshot: 'Site A',
        }),
      }),
    );
    expect(prisma.tx.jobNumberHistory.create).toHaveBeenCalled();
  });

  it('renumbers variations when the parent job number is confirmed', async () => {
    const prisma = createMockPrisma({
      variations: [{ id: 'var-1', jobNumber: 'TMP-001-A', source: 'LOCAL' }],
    });
    prisma.tx.workAssignment.findMany = jest.fn(async ({ where }: { where: { jobId?: string } }) =>
      where.jobId === 'var-1' ? [{ id: 'asg-2', locationType: 'SITE_JOB' }] : [{ id: 'asg-1', locationType: 'SITE_JOB' }],
    );

    const result = await promoteProvisionalJob(prisma as never, {
      companyId: 'co-1',
      jobId: 'job-1',
      userId: 'user-1',
      jobNumber: 'REAL-100',
      customerId: 'cust-new',
    });

    expect(result.variationsUpdated).toBe(1);
    expect(prisma.tx.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'var-1' },
        data: expect.objectContaining({ jobNumber: 'REAL-100-A', customerId: 'cust-new' }),
      }),
    );
  });

  it('rejects variation jobs', async () => {
    const prisma = createMockPrisma();
    prisma.tx.job.findFirst = jest.fn(async () => ({
      id: 'var-1',
      jobNumber: 'TMP-001-A',
      customerId: 'cust-old',
      parentJobId: 'job-1',
      site: null,
      source: 'LOCAL',
      isProvisional: false,
    }));

    await expect(
      promoteProvisionalJob(prisma as never, {
        companyId: 'co-1',
        jobId: 'var-1',
        userId: 'user-1',
        jobNumber: 'REAL-100-A',
        customerId: 'cust-new',
      }),
    ).rejects.toBeInstanceOf(PromoteProvisionalJobError);
  });

  it('rejects external API jobs', async () => {
    const prisma = createMockPrisma();
    prisma.tx.job.findFirst = jest.fn(async () => ({
      id: 'job-1',
      jobNumber: 'API-1',
      customerId: 'cust-old',
      parentJobId: null,
      site: null,
      source: 'EXTERNAL_API',
      isProvisional: false,
    }));

    await expect(
      promoteProvisionalJob(prisma as never, {
        companyId: 'co-1',
        jobId: 'job-1',
        userId: 'user-1',
        jobNumber: 'API-2',
        customerId: 'cust-new',
      }),
    ).rejects.toBeInstanceOf(PromoteProvisionalJobError);
  });
});
