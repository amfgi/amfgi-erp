import { z } from 'zod';

const employeeEmailField = z
  .union([z.string().email(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? null : v));

describe('employee email field schema', () => {
  it('accepts null and empty string as cleared email', () => {
    expect(employeeEmailField.parse(null)).toBeNull();
    expect(employeeEmailField.parse('')).toBeNull();
    expect(employeeEmailField.parse(undefined)).toBeNull();
  });

  it('accepts valid email addresses', () => {
    expect(employeeEmailField.parse('user@example.com')).toBe('user@example.com');
  });

  it('rejects invalid email strings', () => {
    expect(employeeEmailField.safeParse('not-an-email').success).toBe(false);
  });
});
