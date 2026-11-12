import {
  DEFAULT_EMPLOYEE_CODE_SETTINGS,
  extractMaxSequenceFromCodes,
  formatEmployeeCode,
  nextEmployeeCodeFromExisting,
  normalizeEmployeeCodeSettings,
  planEmployeeCodeRenumber,
  previewEmployeeCodeExample,
  temporaryEmployeeCode,
  type EmployeeCodeRenumberSource,
} from '@/lib/hr/employeeCodeSettings';

describe('employeeCodeSettings', () => {
  const ref = new Date(2026, 8, 14); // 2026-09-14

  it('keeps special characters in the prefix', () => {
    expect(normalizeEmployeeCodeSettings({ prefix: ' amf#01 ' }).prefix).toBe('amf#01');
    expect(normalizeEmployeeCodeSettings({ prefix: 'EMP@/A&B' }).prefix).toBe('EMP@/A&B');
  });

  it('strips whitespace and unsupported control characters from prefix', () => {
    expect(normalizeEmployeeCodeSettings({ prefix: 'EM P\n#1' }).prefix).toBe('EMP#1');
  });

  it('formats sequential codes with padding', () => {
    expect(
      formatEmployeeCode(
        { ...DEFAULT_EMPLOYEE_CODE_SETTINGS, prefix: 'EMP', separator: '-', padLength: 4 },
        7,
        ref,
      ),
    ).toBe('EMP-0007');
  });

  it('formats yearly and monthly codes', () => {
    expect(
      formatEmployeeCode(
        { ...DEFAULT_EMPLOYEE_CODE_SETTINGS, countingStyle: 'YEARLY', padLength: 3 },
        1,
        ref,
      ),
    ).toBe('EMP-2026-001');
    expect(
      formatEmployeeCode(
        { ...DEFAULT_EMPLOYEE_CODE_SETTINGS, countingStyle: 'MONTHLY', padLength: 3 },
        12,
        ref,
      ),
    ).toBe('EMP-202609-012');
  });

  it('supports empty separator', () => {
    expect(
      formatEmployeeCode(
        { ...DEFAULT_EMPLOYEE_CODE_SETTINGS, separator: '', padLength: 3 },
        5,
        ref,
      ),
    ).toBe('EMP005');
  });

  it('extracts max sequence and computes next code', () => {
    const settings = { ...DEFAULT_EMPLOYEE_CODE_SETTINGS, padLength: 4 };
    expect(extractMaxSequenceFromCodes(['EMP-0001', 'EMP-0010', 'EMP-ABC', 'OTHER-0009'], settings, ref)).toBe(10);
    expect(nextEmployeeCodeFromExisting(['EMP-0001', 'EMP-0010'], settings, ref)).toBe('EMP-0011');
  });

  it('uses startFrom when no matching codes exist', () => {
    expect(
      nextEmployeeCodeFromExisting([], { ...DEFAULT_EMPLOYEE_CODE_SETTINGS, startFrom: 100 }, ref),
    ).toBe('EMP-0100');
  });

  it('scopes yearly counters to the current year', () => {
    const settings = { ...DEFAULT_EMPLOYEE_CODE_SETTINGS, countingStyle: 'YEARLY' as const, padLength: 3 };
    expect(
      nextEmployeeCodeFromExisting(['EMP-2025-099', 'EMP-2026-004', 'EMP-2026-002'], settings, ref),
    ).toBe('EMP-2026-005');
  });

  it('preview uses startFrom', () => {
    expect(previewEmployeeCodeExample({ ...DEFAULT_EMPLOYEE_CODE_SETTINGS, startFrom: 3 }, ref)).toBe(
      'EMP-0003',
    );
  });
});

describe('planEmployeeCodeRenumber', () => {
  const ref = new Date(2026, 8, 14);
  const person = (
    id: string,
    employeeCode: string,
    hireDate: string | null,
    createdAt: string
  ): EmployeeCodeRenumberSource => ({
    id,
    employeeCode,
    fullName: id,
    hireDate: hireDate ? new Date(hireDate) : null,
    createdAt: new Date(createdAt),
  });

  it('orders by the earlier of hire date and created date, and ignores the old code', () => {
    const rows = planEmployeeCodeRenumber(
      [
        person('c', '6235/66GH', null, '2024-01-01'),
        person('b', 'EMP12JH', '2020-06-01', '2020-06-02'),
        person('a', 'EMP0047', '2020-06-01', '2020-06-01'),
        person('d', 'EMP-0099', '2019-01-01', '2019-01-01'),
      ],
      { ...DEFAULT_EMPLOYEE_CODE_SETTINGS, prefix: 'AMFGI', separator: '', padLength: 4, startFrom: 1 },
      ref
    );
    expect(rows.map((row) => row.id)).toEqual(['d', 'a', 'b', 'c']);
    expect(rows.map((row) => row.newCode)).toEqual(['AMFGI0001', 'AMFGI0002', 'AMFGI0003', 'AMFGI0004']);
    expect(rows.map((row) => row.oldCode)).toEqual(['EMP-0099', 'EMP0047', 'EMP12JH', '6235/66GH']);
  });

  it('puts a record with only an early created date before a later hire', () => {
    const rows = planEmployeeCodeRenumber(
      [
        person('later-hire', 'EMP-9', '2024-06-01', '2024-06-01'),
        person('early-record', '66GH', null, '2018-02-01'),
      ],
      DEFAULT_EMPLOYEE_CODE_SETTINGS,
      ref
    );
    expect(rows.map((row) => row.id)).toEqual(['early-record', 'later-hire']);
    expect(rows.map((row) => row.newCode)).toEqual(['EMP-0001', 'EMP-0002']);
  });

  it('keeps hire date ahead of an earlier created date when both exist', () => {
    const rows = planEmployeeCodeRenumber(
      [
        person('hired-2022', 'A', '2022-01-01', '2017-01-01'),
        person('hired-2019', 'B', '2019-05-01', '2023-01-01'),
      ],
      DEFAULT_EMPLOYEE_CODE_SETTINGS,
      ref
    );
    expect(rows.map((row) => row.id)).toEqual(['hired-2019', 'hired-2022']);
  });

  it('breaks a remaining tie by id and starts at startFrom', () => {
    const rows = planEmployeeCodeRenumber(
      [
        person('m2', 'X', '2021-01-01', '2021-01-01'),
        person('m1', 'Y', '2021-01-01', '2021-01-01'),
      ],
      { ...DEFAULT_EMPLOYEE_CODE_SETTINGS, startFrom: 10 },
      ref
    );
    expect(rows.map((row) => [row.id, row.newCode])).toEqual([
      ['m1', 'EMP-0010'],
      ['m2', 'EMP-0011'],
    ]);
  });

  it('puts every existing employee on the current yearly series', () => {
    const rows = planEmployeeCodeRenumber(
      [person('old', 'EMP-2020-0004', '2018-03-01', '2018-03-01')],
      { ...DEFAULT_EMPLOYEE_CODE_SETTINGS, countingStyle: 'YEARLY', padLength: 3 },
      ref
    );
    expect(rows[0]?.newCode).toBe('EMP-2026-001');
  });

  it('keeps temporary codes distinct from each other and from the final codes', () => {
    const temps = ['a', 'b'].map(temporaryEmployeeCode);
    expect(new Set(temps).size).toBe(2);
    expect(temps.every((code) => code.startsWith('__tmp__'))).toBe(true);
    const finals = planEmployeeCodeRenumber(
      [person('a', temps[0]!, null, '2024-01-01'), person('b', temps[1]!, null, '2024-01-02')],
      DEFAULT_EMPLOYEE_CODE_SETTINGS,
      ref
    ).map((row) => row.newCode);
    expect(finals.some((code) => temps.includes(code))).toBe(false);
  });
});
