import {
  mergeWorkforceIntoProfileExtension,
  profileExtensionForEmployeeImport,
} from '@/lib/hr/employeeImportProfile';
import { readOnLeaveFrom } from '@/lib/hr/employeeLeavePeriod';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';
import {
  employeeImportRowToPayload,
  employeeToExportRow,
  mapEmployeeImportRow,
} from '@/lib/import-export/employeeFields';
import { compensationFieldsToExportColumns } from '@/lib/import-export/employeeCompensationFields';

describe('employee import/export fields', () => {
  it('maps workforce short type labels on import', () => {
    const mapped = mapEmployeeImportRow(
      ['EMP-1', 'Jane Doe', 'Driver'],
      ['Employee Code', 'Full Name', 'Employee Type'],
      { 0: 'employee_code', 1: 'full_name', 2: 'employee_type' },
      2
    );
    expect(mapped.__errors).toEqual([]);
    expect(mapped.employeeType).toBe('DRIVER');
  });

  it('builds partial update payloads from mapped columns only', () => {
    const mapped = mapEmployeeImportRow(
      ['EMP-1', 'Jane Doe', 'Production'],
      ['Employee Code', 'Full Name', 'Department'],
      { 0: 'employee_code', 1: 'full_name', 2: 'department' },
      2
    );
    const payload = employeeImportRowToPayload(mapped);
    expect(payload.department).toBe('Production');
    expect(payload.email).toBeUndefined();
    expect(payload.employeeType).toBeUndefined();
  });

  it('merges workforce without wiping onLeaveFrom on status change back to active', () => {
    const existing = {
      onLeaveFrom: '2026-05-01',
      workforce: {
        employeeType: 'OFFICE_STAFF',
        visaHolding: 'COMPANY_PROVIDED',
        expertises: ['Lamination'],
      },
    };
    const merged = profileExtensionForEmployeeImport({
      existingExtension: existing,
      previousStatus: 'ON_LEAVE',
      nextStatus: 'ACTIVE',
      workforcePatch: { employeeType: 'DRIVER' },
      isCreate: false,
    });
    expect(parseWorkforceProfile(merged).employeeType).toBe('DRIVER');
    expect(parseWorkforceProfile(merged).expertises).toEqual(['Lamination']);
    expect(readOnLeaveFrom(merged)).toBeNull();
  });

  it('preserves non-workforce profile keys when patching workforce', () => {
    const existing = { customFlag: true, workforce: { employeeType: 'DRIVER', visaHolding: 'SELF_OWN', expertises: [] } };
    const merged = mergeWorkforceIntoProfileExtension(existing, { visaHolding: 'NO_VISA' });
    expect((merged as { customFlag?: boolean }).customFlag).toBe(true);
    expect(parseWorkforceProfile(merged).visaHolding).toBe('NO_VISA');
  });

  it('normalizes gender labels on import', () => {
    const mapped = mapEmployeeImportRow(
      ['EMP-1', 'Jane Doe', 'Female'],
      ['Employee Code', 'Full Name', 'Gender'],
      { 0: 'employee_code', 1: 'full_name', 2: 'gender' },
      2
    );
    expect(mapped.__errors).toEqual([]);
    expect(mapped.gender).toBe('F');
    const payload = employeeImportRowToPayload(mapped);
    expect(payload.gender).toBe('F');
  });

  it('exports compensation columns from current package snapshot', () => {
    const row = employeeToExportRow({
      id: 'e1',
      employeeCode: 'EMP-1',
      fullName: 'Jane Doe',
      preferredName: null,
      email: null,
      phone: null,
      nationality: null,
      dateOfBirth: null,
      gender: null,
      designation: null,
      department: null,
      employmentType: null,
      signatureGroup: null,
      hireDate: null,
      terminationDate: null,
      status: 'ACTIVE',
      emergencyContactName: null,
      emergencyContactPhone: null,
      bloodGroup: null,
      portalEnabled: false,
      adminNotes: null,
      profileExtension: null,
      currentCompensation: {
        payTypeName: 'Monthly Office',
        payTypeCode: 'MONTHLY_OFFICE',
        payTypeMode: 'MONTHLY_CALENDAR_DEDUCT',
        monthlyBasic: 3500,
        dailyRate: null,
        components: [
          { name: 'Housing Allowance', amount: 1500, componentKind: 'EARNING' },
          { name: 'Loan', amount: 200, componentKind: 'DEDUCTION' },
        ],
        totalMonthly: 4800,
        effectiveFrom: '2024-01-01',
      },
    });
    expect(row['Compensation Type']).toBe('Monthly Office');
    expect(row['Compensation Basic']).toBe(3500);
    expect(row['Compensation Components']).toBe('Housing Allowance=1500; Loan=-200');
    expect(row['Compensation Total']).toBe(4800);
    expect(row['Compensation Effective From']).toBe('2024-01-01');
    expect(compensationFieldsToExportColumns(null)['Compensation Type']).toBe('');
  });
});
