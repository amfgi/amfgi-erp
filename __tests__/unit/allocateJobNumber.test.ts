import { allocateJobNumber, variationSuffixForParent } from '@/lib/jobs/allocateJobNumber';

describe('allocateJobNumber', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-29T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function company(settings: unknown = null) {
    return {
      findUnique: jest.fn(async () => ({ documentSerialSettings: settings })),
    };
  }

  it('assigns the next J year serial and ignores variation suffixes', async () => {
    const tx = {
      company: company(),
      job: {
        findMany: jest.fn(async () => [
          { jobNumber: 'J26-0002' },
          { jobNumber: 'J26-0002-A' },
          { jobNumber: 'JOB-2024-001' },
        ]),
        findFirst: jest.fn(async () => null),
      },
    };

    await expect(allocateJobNumber(tx as never, 'co-1')).resolves.toBe('J26-0003');
  });

  it('skips a serial that is already taken', async () => {
    const tx = {
      company: company(),
      job: {
        findMany: jest.fn(async () => [{ jobNumber: 'J26-0001' }]),
        findFirst: jest.fn(async ({ where }: { where: { jobNumber?: string } }) => (
          where.jobNumber === 'J26-0002' ? { id: 'taken' } : null
        )),
      },
    };

    await expect(allocateJobNumber(tx as never, 'co-1')).resolves.toBe('J26-0003');
  });

  it('starts at the serial entered in settings when nothing higher exists', async () => {
    const tx = {
      company: company({ job: 1234 }),
      job: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async () => null),
      },
    };

    await expect(allocateJobNumber(tx as never, 'co-1')).resolves.toBe('J26-1234');
  });

  it('continues after a higher serial that is already in use', async () => {
    const tx = {
      company: company({ job: 100 }),
      job: {
        findMany: jest.fn(async () => [{ jobNumber: 'J26-2228' }]),
        findFirst: jest.fn(async () => null),
      },
    };

    await expect(allocateJobNumber(tx as never, 'co-1')).resolves.toBe('J26-2229');
  });

  it('jumps forward when the starting serial is above the latest number', async () => {
    const tx = {
      company: company({ job: 5000 }),
      job: {
        findMany: jest.fn(async () => [{ jobNumber: 'J26-2228' }]),
        findFirst: jest.fn(async () => null),
      },
    };

    await expect(allocateJobNumber(tx as never, 'co-1')).resolves.toBe('J26-5000');
  });

  it('uses a custom starting tag and ignores numbers from the old tag', async () => {
    const tx = {
      company: company({ job: 1, prefixes: { job: 'JOB' } }),
      job: {
        findMany: jest.fn(async () => [{ jobNumber: 'J26-2228' }, { jobNumber: 'JOB26-0003' }]),
        findFirst: jest.fn(async () => null),
      },
    };

    await expect(allocateJobNumber(tx as never, 'co-1')).resolves.toBe('JOB26-0004');
  });
});

describe('variationSuffixForParent', () => {
  it('uses the typed suffix', () => {
    expect(variationSuffixForParent('J26-0001', 'A', 'OTHER-9')).toBe('A');
  });

  it('reads a suffix from a full variation number', () => {
    expect(variationSuffixForParent('J26-0001', '', 'J26-0001-Phase1')).toBe('Phase1');
  });

  it('rejects a number that does not belong to the parent', () => {
    expect(variationSuffixForParent('J26-0001', '', 'J26-9999')).toBe('');
  });
});
