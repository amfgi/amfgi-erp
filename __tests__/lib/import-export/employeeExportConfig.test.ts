import {
  DEFAULT_EMPLOYEE_EXPORT_COLUMN_KEYS,
  EMPLOYEE_EXPORT_COLUMNS,
  pickExportRowColumns,
  sortEmployeeExportRecords,
} from '@/lib/import-export/employeeExportConfig';
import type { HrEmployeeExportRecord } from '@/store/api/endpoints/hr';

describe('employee export config', () => {
  const sample = (overrides: Partial<HrEmployeeExportRecord> = {}): HrEmployeeExportRecord => ({
    id: 'e1',
    employeeCode: 'B-002',
    fullName: 'Bravo',
    preferredName: null,
    email: null,
    phone: null,
    nationality: null,
    dateOfBirth: null,
    gender: null,
    designation: null,
    department: 'Ops',
    employmentType: null,
    signatureGroup: null,
    hireDate: '2024-06-01',
    terminationDate: null,
    status: 'ACTIVE',
    emergencyContactName: null,
    emergencyContactPhone: null,
    bloodGroup: null,
    portalEnabled: false,
    adminNotes: null,
    profileExtension: { workforce: { employeeType: 'DRIVER', visaHolding: 'NO_VISA', expertises: [] } },
    ...overrides,
  });

  it('picks only selected export columns', () => {
    const row = { ID: 'e1', 'Full Name': 'Jane', Email: 'j@x.com' };
    expect(pickExportRowColumns(row, ['Full Name', 'Email'])).toEqual({
      'Full Name': 'Jane',
      Email: 'j@x.com',
    });
  });

  it('sorts export records by employee code', () => {
    const rows = [sample({ employeeCode: 'B-002' }), sample({ id: 'e2', employeeCode: 'A-001', fullName: 'Alpha' })];
    const sorted = sortEmployeeExportRecords(rows, 'employeeCode', 'asc');
    expect(sorted.map((r) => r.employeeCode)).toEqual(['A-001', 'B-002']);
  });

  it('sorts mixed prefixes by the shared serial, not the prefix text', () => {
    const rows = [
      sample({ id: 'a2', employeeCode: 'AMF-0002', fullName: 'Two' }),
      sample({ id: 't1', employeeCode: 'TMP-0001', fullName: 'Temp' }),
      sample({ id: 'a10', employeeCode: 'AMF-0010', fullName: 'Ten' }),
    ];
    const sorted = sortEmployeeExportRecords(rows, 'employeeCode', 'asc');
    expect(sorted.map((r) => r.employeeCode)).toEqual(['TMP-0001', 'AMF-0002', 'AMF-0010']);
  });

  it('defines a default column list covering all export fields', () => {
    expect(DEFAULT_EMPLOYEE_EXPORT_COLUMN_KEYS.length).toBe(EMPLOYEE_EXPORT_COLUMNS.length);
  });
});
