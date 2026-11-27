import { changeJobSerial, checkJobSerial, JobSerialError } from '@/lib/jobs/changeJobSerial';
import { canChangeJobSerial, jobSerialNumber, splitJobSerial } from '@/lib/jobs/jobSerial';

describe('job serial helpers', () => {
  it('keeps the prefix and rebuilds only the serial', () => {
    expect(splitJobSerial('J26-0001')).toEqual({ prefix: 'J26-', serial: '0001' });
    expect(jobSerialNumber('J26-', '42')).toBe('J26-0042');
    expect(jobSerialNumber('J26-', '0')).toBeNull();
    expect(jobSerialNumber('J26-', '12a')).toBeNull();
    expect(splitJobSerial('NO-SERIAL')).toBeNull();
  });

  it('allows the control only on a local parent job whose number ends in digits', () => {
    expect(canChangeJobSerial({ jobNumber: 'J26-0001', parentJobId: null, source: 'LOCAL' }, true)).toBe(true);
    expect(canChangeJobSerial({ jobNumber: 'J26-0001-2', parentJobId: 'parent', source: 'LOCAL' }, true)).toBe(false);
    expect(canChangeJobSerial({ jobNumber: 'J26-0001', parentJobId: null, source: 'EXTERNAL_API' }, true)).toBe(false);
    expect(canChangeJobSerial({ jobNumber: 'J26-0001', parentJobId: null, source: 'LOCAL' }, false)).toBe(false);
    expect(canChangeJobSerial({ jobNumber: 'CUSTOM', parentJobId: null, source: 'LOCAL' }, true)).toBe(false);
  });
});

function createMockPrisma(options?: {
  job?: Partial<{
    id: string;
    jobNumber: string;
    parentJobId: string | null;
    source: 'LOCAL' | 'EXTERNAL_API';
    customerId: string;
    site: string | null;
  }>;
  variations?: Array<{ id: string; jobNumber: string; source: 'LOCAL' | 'EXTERNAL_API' }>;
  taken?: string[];
}) {
  const job = {
    id: 'job-1',
    jobNumber: 'J26-0001',
    parentJobId: null as string | null,
    source: 'LOCAL' as const,
    customerId: 'cust-1',
    site: 'Site A',
    customer: { name: 'Acme Ltd' },
    ...options?.job,
  };
  const taken = new Set(options?.taken ?? []);

  const tx = {
    job: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string; jobNumber?: string } }) => {
        if (where.id === job.id) return job;
        if (where.jobNumber && taken.has(where.jobNumber)) return { id: 'other' };
        return null;
      }),
      findMany: jest.fn(async () => options?.variations ?? []),
      update: jest.fn(async () => ({})),
    },
    workAssignment: {
      findMany: jest.fn(async () => [{ id: 'asg-1', locationType: 'SITE_JOB' }]),
      update: jest.fn(async () => ({})),
    },
    jobNumberHistory: {
      create: jest.fn(async () => ({})),
    },
  };

  return {
    $transaction: jest.fn(async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx)),
    ...tx,
    tx,
  };
}

describe('changeJobSerial', () => {
  it('renames the parent and keeps each variation suffix', async () => {
    const prisma = createMockPrisma({
      variations: [{ id: 'var-1', jobNumber: 'J26-0001-2', source: 'LOCAL' }],
    });

    const result = await changeJobSerial(prisma as never, {
      companyId: 'co-1',
      id: 'job-1',
      userId: 'user-1',
      serial: '42',
    });

    expect(result.jobNumber).toBe('J26-0042');
    expect(result.variationsUpdated).toBe(1);
    expect(prisma.tx.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job-1' }, data: { jobNumber: 'J26-0042' } }),
    );
    expect(prisma.tx.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'var-1' }, data: { jobNumber: 'J26-0042-2' } }),
    );
    expect(prisma.tx.workAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobNumberSnapshot: 'J26-0042', clientNameSnapshot: 'Acme Ltd' }),
      }),
    );
    expect(prisma.tx.jobNumberHistory.create).toHaveBeenCalledTimes(2);
  });

  it('reports a taken parent serial and refuses to save it', async () => {
    const prisma = createMockPrisma({ taken: ['J26-0042'] });

    await expect(checkJobSerial(prisma as never, { companyId: 'co-1', id: 'job-1', serial: '42' })).resolves.toEqual({
      number: 'J26-0042',
      available: false,
    });
    await expect(
      changeJobSerial(prisma as never, { companyId: 'co-1', id: 'job-1', userId: 'user-1', serial: '42' }),
    ).rejects.toMatchObject({ message: 'Not available, try another', status: 409 });
  });

  it('reports a variation collision when the new suffix number is already used', async () => {
    const prisma = createMockPrisma({
      variations: [{ id: 'var-1', jobNumber: 'J26-0001-2', source: 'LOCAL' }],
      taken: ['J26-0042-2'],
    });

    await expect(checkJobSerial(prisma as never, { companyId: 'co-1', id: 'job-1', serial: '42' })).resolves.toEqual({
      number: 'J26-0042',
      available: false,
    });
    expect(prisma.tx.job.update).not.toHaveBeenCalled();
  });

  it('rejects an externally synced job and a variation job', async () => {
    const external = createMockPrisma({ job: { source: 'EXTERNAL_API' } });
    await expect(
      checkJobSerial(external as never, { companyId: 'co-1', id: 'job-1', serial: '42' }),
    ).rejects.toBeInstanceOf(JobSerialError);

    const variation = createMockPrisma({ job: { parentJobId: 'parent' } });
    await expect(
      changeJobSerial(variation as never, { companyId: 'co-1', id: 'job-1', userId: 'user-1', serial: '42' }),
    ).rejects.toMatchObject({ message: 'Variation numbers follow the parent job number', status: 422 });
  });

  it('rejects a serial that would make a variation number too long', async () => {
    const prisma = createMockPrisma({
      variations: [{ id: 'var-1', jobNumber: `J26-0001-${'A'.repeat(95)}`, source: 'LOCAL' }],
    });

    await expect(
      changeJobSerial(prisma as never, { companyId: 'co-1', id: 'job-1', userId: 'user-1', serial: '42' }),
    ).rejects.toMatchObject({ message: 'That serial is too long', status: 422 });
  });

  it('leaves the number alone when the serial is unchanged', async () => {
    const prisma = createMockPrisma();
    const result = await changeJobSerial(prisma as never, {
      companyId: 'co-1',
      id: 'job-1',
      userId: 'user-1',
      serial: '1',
    });
    expect(result.jobNumber).toBe('J26-0001');
    expect(prisma.tx.job.update).not.toHaveBeenCalled();
  });
});
