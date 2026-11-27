import { roundGrossToWholeDirham } from '@/lib/hr/payroll/calendar';

describe('roundGrossToWholeDirham', () => {
  it('keeps a fraction below 0.75 on the lower dirham', () => {
    expect(roundGrossToWholeDirham(2177.42)).toBe(2177);
    expect(roundGrossToWholeDirham(2177.74)).toBe(2177);
  });

  it('moves 0.75 and above to the next dirham', () => {
    expect(roundGrossToWholeDirham(2177.75)).toBe(2178);
    expect(roundGrossToWholeDirham(2177.99)).toBe(2178);
  });

  it('leaves a whole dirham unchanged', () => {
    expect(roundGrossToWholeDirham(2177)).toBe(2177);
    expect(roundGrossToWholeDirham(2177.0)).toBe(2177);
  });

  it('applies the same threshold to a negative gross', () => {
    expect(roundGrossToWholeDirham(-2177.42)).toBe(-2177);
    expect(roundGrossToWholeDirham(-2177.75)).toBe(-2178);
  });
});
