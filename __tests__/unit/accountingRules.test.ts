import { isContraType, oppositeSide, parseMoney } from '@/lib/accounting/rules';
import { prepareJournalLines } from '@/lib/accounting/posting';

describe('accounting rules', () => {
  it('keeps money out as the opposite side', () => {
    expect(oppositeSide('DEBIT')).toBe('CREDIT');
    expect(oppositeSide('CREDIT')).toBe('DEBIT');
  });

  it('marks a mismatched increase side as contra', () => {
    expect(isContraType('CREDIT', 'DEBIT')).toBe(true);
    expect(isContraType('DEBIT', 'CREDIT')).toBe(true);
    expect(isContraType('CREDIT', 'CREDIT')).toBe(false);
  });

  it('rejects negative and extra decimal amounts', () => {
    expect(parseMoney('-1').ok).toBe(false);
    expect(parseMoney('10.005').ok).toBe(false);
    expect(parseMoney('10.5')).toEqual({ ok: true, fils: 1050 });
    expect(parseMoney('')).toEqual({ ok: true, fils: 0 });
  });

  it('requires a balanced journal with one side per line', () => {
    const bad = prepareJournalLines([
      { accountId: 'a', debit: '10', credit: '10' },
      { accountId: 'b', debit: '0', credit: '0' },
    ]);
    expect(bad.ok).toBe(false);

    const good = prepareJournalLines([
      { accountId: 'ar', debit: '10500', credit: '' },
      { accountId: 'sales', debit: '', credit: '10000' },
      { accountId: 'vat', debit: '', credit: '500' },
      { accountId: '', debit: '', credit: '' },
    ]);
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.lines).toHaveLength(3);
      expect(good.debitFils).toBe(good.creditFils);
    }
  });
});
