import {
  buildEmployeeListWhere,
  filterEmployeesByWorkforceFilters,
  parseEmployeeFilterValues,
} from '@/lib/hr/employeeListQuery';

describe('employee list query filters', () => {
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
});
