import { listCompensationPackagesOverlappingMonth } from '@/lib/hr/payroll/resolveCompensationForPayroll';

describe('employees pending compensation overlap logic', () => {
  it('treats employees with no month-overlapping active package as pending', () => {
    const month = '2026-07';
    const activePackages: Array<{
      id: string;
      effectiveFrom: Date;
      effectiveTo: Date | null;
      createdAt: Date;
      payType: { isActive: boolean };
    }> = [];

    expect(listCompensationPackagesOverlappingMonth(activePackages, month)).toHaveLength(0);

    const closedOnly = [
      {
        id: 'pkg-1',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-06-30T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        payType: { isActive: true },
      },
    ];
    expect(listCompensationPackagesOverlappingMonth(closedOnly, month)).toHaveLength(0);

    const overlapping = [
      {
        id: 'pkg-2',
        effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
        effectiveTo: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        payType: { isActive: true },
      },
    ];
    expect(listCompensationPackagesOverlappingMonth(overlapping, month)).toHaveLength(1);
  });
});
