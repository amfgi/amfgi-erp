import { companyIdWhere, isCompanyAccessible, resolveHrWriteCompanyId } from '@/lib/hr/hrCompanyScope';

describe('hrCompanyScope helpers', () => {
  it('companyIdWhere uses equality for a single id', () => {
    expect(companyIdWhere(['c1'])).toEqual({ companyId: 'c1' });
  });

  it('companyIdWhere uses in for multiple ids', () => {
    expect(companyIdWhere(['c1', 'c2'])).toEqual({ companyId: { in: ['c1', 'c2'] } });
  });

  it('isCompanyAccessible checks membership', () => {
    expect(isCompanyAccessible('c1', ['c1', 'c2'])).toBe(true);
    expect(isCompanyAccessible('c3', ['c1', 'c2'])).toBe(false);
  });

  it('resolveHrWriteCompanyId prefers requested over active', () => {
    expect(
      resolveHrWriteCompanyId({ requestedCompanyId: 'req', activeCompanyId: 'active' })
    ).toBe('req');
    expect(resolveHrWriteCompanyId({ requestedCompanyId: null, activeCompanyId: 'active' })).toBe(
      'active'
    );
    expect(resolveHrWriteCompanyId({ requestedCompanyId: '  ', activeCompanyId: null })).toBe(null);
  });
});
