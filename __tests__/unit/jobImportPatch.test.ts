import {
  buildParentJobCreateData,
  buildParentJobUpdatePatch,
} from '@/lib/import-export/jobImportPatch';

describe('jobImportPatch', () => {
  it('update patch only includes mapped columns', () => {
    const patch = buildParentJobUpdatePatch(
      {
        jobNumber: 'JOB-1',
        projectType: 'Fit-out',
        projectQtyArea: '500 sqm',
      },
      'cust-1',
    );

    expect(patch).toEqual({
      jobNumber: 'JOB-1',
      customerId: 'cust-1',
      projectType: 'Fit-out',
      projectQtyArea: '500 sqm',
    });
    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('description');
  });

  it('create data defaults status and start date', () => {
    const data = buildParentJobCreateData(
      {
        jobNumber: 'JOB-2',
        projectType: 'Maintenance',
      },
      'cust-1',
    );

    expect(data.status).toBe('ACTIVE');
    expect(data.projectType).toBe('Maintenance');
    expect(data.startDate).toBeInstanceOf(Date);
  });
});
