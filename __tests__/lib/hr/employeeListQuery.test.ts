import {
  buildEmployeeListWhere,
  compareEmployeesByCodeSerial,
  filterEmployeesByWorkforceFilters,
  parseEmployeeFilterValues,
  sortEmployeesByName,
} from '@/lib/hr/employeeListQuery';

describe('employee list query filters', () => {
  it('filters by designation', () => {
    const where = buildEmployeeListWhere('company-1', { designation: 'Worker' });
    expect(where).toMatchObject({
      companyId: 'company-1',
      AND: [{ designation: 'Worker' }],
    });
  });

  it('applies employment type filter in prisma where', () => {
    const where = buildEmployeeListWhere('company-1', { employmentType: 'Permanent' });
    expect(where).toMatchObject({
      companyId: 'company-1',
      AND: [{ employmentType: 'Permanent' }],
    });
  });

  it('supports multiple employment types', () => {
    const where = buildEmployeeListWhere('company-1', { employmentType: 'Permanent,Contract' });
    expect(where).toMatchObject({
      companyId: 'company-1',
      AND: [{ employmentType: { in: ['Permanent', 'Contract'] } }],
    });
  });

  it('supports multiple statuses', () => {
    const where = buildEmployeeListWhere('company-1', { status: 'ACTIVE,ON_LEAVE' });
    expect(where).toMatchObject({
      companyId: 'company-1',
      status: { in: ['ACTIVE', 'ON_LEAVE'] },
    });
  });

  it('filters workforce visa holding and expertise from profile extension', () => {
    const rows = [
      {
        profileExtension: {
          workforce: {
            employeeType: 'DRIVER',
            visaHolding: 'COMPANY_PROVIDED',
            expertises: ['Welding'],
          },
        },
      },
      {
        profileExtension: {
          workforce: {
            employeeType: 'OFFICE_STAFF',
            visaHolding: 'NO_VISA',
            expertises: ['Driving'],
          },
        },
      },
    ];

    const byVisa = filterEmployeesByWorkforceFilters(rows, { visaHolding: 'NO_VISA' });
    expect(byVisa).toHaveLength(1);
    expect(byVisa[0]).toEqual(rows[1]);

    const byExpertise = filterEmployeesByWorkforceFilters(rows, { expertise: 'Welding,Driving' });
    expect(byExpertise).toHaveLength(2);

    expect(parseEmployeeFilterValues('ACTIVE, ON_LEAVE')).toEqual(['ACTIVE', 'ON_LEAVE']);
  });

  it('orders employees by the numeric serial in the code, then the prefix', () => {
    const rows = [
      { employeeCode: 'AMF-0002', fullName: 'Later', preferredName: null },
      { employeeCode: 'TMP-0001', fullName: 'Temp', preferredName: null },
      { employeeCode: 'AMF-0010', fullName: 'Ten', preferredName: null },
      { employeeCode: 'AMF-0001', fullName: 'First', preferredName: null },
      { employeeCode: 'NO-NUMBER', fullName: 'Plain', preferredName: null },
    ];
    const sorted = [...rows].sort(compareEmployeesByCodeSerial);
    expect(sorted.map((row) => row.employeeCode)).toEqual([
      'AMF-0001',
      'TMP-0001',
      'AMF-0002',
      'AMF-0010',
      'NO-NUMBER',
    ]);
  });

  it('keeps the default name sort alphabetical', () => {
    const sorted = sortEmployeesByName([
      { fullName: 'Zed', preferredName: null },
      { fullName: 'Ann', preferredName: 'Bea' },
      { fullName: 'Ann', preferredName: null },
    ]);
    expect(sorted.map((row) => row.preferredName || row.fullName)).toEqual(['Ann', 'Bea', 'Zed']);
  });
});
