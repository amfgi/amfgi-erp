import { leaveDaysForRequest } from '@/lib/hr/leaveBalance';
import { leaveRangesOverlapInclusive } from '@/lib/hr/leaveTypes';

const d = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('leaveRangesOverlapInclusive', () => {
  it('detects identical ranges as overlapping', () => {
    expect(leaveRangesOverlapInclusive(d('2026-03-01'), d('2026-03-05'), d('2026-03-01'), d('2026-03-05'))).toBe(true);
  });

  it('detects a fully contained range as overlapping', () => {
    expect(leaveRangesOverlapInclusive(d('2026-03-01'), d('2026-03-10'), d('2026-03-04'), d('2026-03-06'))).toBe(true);
  });

  it('treats a single shared boundary day as overlapping', () => {
    // Mon–Tue vs Tue–Wed share Tuesday.
    expect(leaveRangesOverlapInclusive(d('2026-03-02'), d('2026-03-03'), d('2026-03-03'), d('2026-03-04'))).toBe(true);
  });

  it('does not flag back-to-back ranges with no shared day', () => {
    // Mon–Tue vs Wed–Thu.
    expect(leaveRangesOverlapInclusive(d('2026-03-02'), d('2026-03-03'), d('2026-03-04'), d('2026-03-05'))).toBe(false);
  });

  it('does not flag clearly disjoint ranges', () => {
    expect(leaveRangesOverlapInclusive(d('2026-03-01'), d('2026-03-02'), d('2026-03-20'), d('2026-03-25'))).toBe(false);
  });
});

describe('leaveDaysForRequest', () => {
  it('counts inclusive calendar days for annual leave that deducts', () => {
    expect(leaveDaysForRequest('ANNUAL', d('2026-03-01'), d('2026-03-03'), true)).toBe(3);
  });

  it('returns 0 when the request does not deduct from balance', () => {
    expect(leaveDaysForRequest('ANNUAL', d('2026-03-01'), d('2026-03-03'), false)).toBe(0);
  });

  it('honors deductFromBalance for non-annual configured types (e.g. EMERGENCY/PAID)', () => {
    // Regression: previously the legacy-enum gate returned 0 even when the leave
    // type was explicitly configured to deduct from balance.
    expect(leaveDaysForRequest('EMERGENCY', d('2026-03-01'), d('2026-03-02'), true)).toBe(2);
    expect(leaveDaysForRequest('SICK', d('2026-03-01'), d('2026-03-01'), true)).toBe(1);
  });

  it('counts a single day for a one-day leave', () => {
    expect(leaveDaysForRequest('ONE_DAY', d('2026-03-04'), d('2026-03-04'), true)).toBe(1);
  });
});
