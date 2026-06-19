import { checkJobDeleteEligibility } from '@/lib/jobs/checkJobDeleteEligibility';

function createMockPrisma(counts: Partial<Record<string, number>> = {}) {
  const job = {
    id: 'job-1',
    parentJobId: null as string | null,
    source: 'LOCAL' as const,
    jobNumber: 'JOB-001',
    status: 'ACTIVE' as const,
  };

  const count = (key: string) => jest.fn(async () => counts[key] ?? 0);

  return {
    job: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'job-1' ? job : null,
      ),
      count: count('variations'),
    },
    transaction: { count: count('transactions') },
    dispatchEntryRevision: { count: count('dispatch') },
    deliveryNote: {
      count: jest.fn(async ({ where }: { where: { jobId?: string; referenceJobId?: string } }) => {
        if (where.referenceJobId) return counts.deliveryReference ?? 0;
        return counts.delivery ?? 0;
      }),
    },
    workAssignment: { count: count('schedule') },
    attendanceEntry: { count: count('attendance') },
    quantityLogAdhocJob: { count: count('quantityLog') },
    jobCostingSnapshot: { count: count('budget') },
    jobItemProgressEntry: { count: count('progress') },
    _job: job,
  };
}

describe('checkJobDeleteEligibility', () => {
  it('allows delete when no linked records exist', async () => {
    const prisma = createMockPrisma();
    const result = await checkJobDeleteEligibility(prisma as never, 'co-1', 'job-1');
    expect(result.canDelete).toBe(true);
    expect(result.links).toHaveLength(0);
  });

  it('blocks parent delete when variations exist', async () => {
    const prisma = createMockPrisma({ variations: 2 });
    const result = await checkJobDeleteEligibility(prisma as never, 'co-1', 'job-1');
    expect(result.canDelete).toBe(false);
    expect(result.links).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'variations', count: 2 })]),
    );
  });

  it('blocks delete when schedule or attendance is linked', async () => {
    const prisma = createMockPrisma({ schedule: 1, attendance: 3 });
    const result = await checkJobDeleteEligibility(prisma as never, 'co-1', 'job-1');
    expect(result.canDelete).toBe(false);
    expect(result.links.map((link) => link.category)).toEqual(
      expect.arrayContaining(['schedule', 'attendance']),
    );
  });

  it('blocks external API jobs', async () => {
    const prisma = createMockPrisma();
    prisma._job.source = 'EXTERNAL_API';
    const result = await checkJobDeleteEligibility(prisma as never, 'co-1', 'job-1');
    expect(result.canDelete).toBe(false);
    expect(result.deleteBlockedReason).toBe('external_api');
  });
});
