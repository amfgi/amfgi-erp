import {
  DEFAULT_EMPLOYEE_CODE_SETTINGS,
  extractMaxSequenceFromCodes,
  formatEmployeeCode,
  nextEmployeeCodeFromExisting,
  normalizeEmployeeCodeSettings,
  previewEmployeeCodeExample,
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
