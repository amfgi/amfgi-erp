import { sumMoney } from '@/lib/hr/payroll/calendar';
import {
  fineHistoryDescription,
  formatDeductionSpan,
  payrollInstallmentDescription,
  planFineInstallments,
  splitFineAmount,
} from '@/lib/hr/payroll/fineInstallments';

describe('fine installment split', () => {
  it('puts leftover fils on the last month and keeps the total', () => {
    const parts = splitFineAmount(1000, 3);
    expect(parts?.map((amount) => amount.toFixed(2))).toEqual(['333.33', '333.33', '333.34']);
    expect(sumMoney(parts ?? [])).toBe(1000);
  });

  it('rejects a split that would leave a month at zero', () => {
    expect(splitFineAmount(0.02, 3)).toBeNull();
    const planned = planFineInstallments({
      fineDate: '2026-11-21',
      amount: 0.02,
      recovery: { mode: 'range', from: '2026-11', to: '2027-01' },
    });
    expect(planned).toEqual({ error: 'This amount can be split across at most 2 months' });
  });

  it('caps a range at 12 months', () => {
    const planned = planFineInstallments({
      fineDate: '2026-11-21',
      amount: 1200,
      recovery: { mode: 'range', from: '2026-11', to: '2027-11' },
    });
    expect(planned).toEqual({ error: 'A fine can be split across at most 12 months' });

    const allowed = planFineInstallments({
      fineDate: '2026-11-21',
      amount: 1200,
      recovery: { mode: 'range', from: '2026-11', to: '2027-10' },
    });
    expect('installments' in allowed && allowed.installments).toHaveLength(12);
    if ('installments' in allowed) expect(sumMoney(allowed.installments.map((row) => row.amount))).toBe(1200);
  });

  it('defaults to the fine month and can move the full amount later', () => {
    const fineMonth = planFineInstallments({ fineDate: '2026-11-21', amount: 500, recovery: null });
    expect(fineMonth).toEqual({
      installments: [{ payrollMonth: '2026-11', amount: 500, sequence: 1 }],
    });

    const later = planFineInstallments({
      fineDate: '2026-11-21',
      amount: 500,
      recovery: { mode: 'month', month: '2027-02' },
    });
    expect(later).toEqual({
      installments: [{ payrollMonth: '2027-02', amount: 500, sequence: 1 }],
    });
  });

  it('rejects a month before the fine and a range that starts too early', () => {
    expect(
      planFineInstallments({
        fineDate: '2026-11-21',
        amount: 100,
        recovery: { mode: 'month', month: '2026-10' },
      })
    ).toEqual({ error: 'Choose the fine month or a later month' });

    const laterRange = planFineInstallments({
      fineDate: '2026-11-21',
      amount: 300,
      recovery: { mode: 'range', from: '2026-12', to: '2027-02' },
    });
    expect('installments' in laterRange && laterRange.installments.map((row) => row.payrollMonth)).toEqual([
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('labels a single payroll line without a fraction and a split with one', () => {
    expect(payrollInstallmentDescription('Late arrival', 1, 1)).toBe('Late arrival');
    expect(payrollInstallmentDescription('Late arrival', 2, 3)).toBe('Late arrival (2/3)');
    expect(formatDeductionSpan(['2026-11', '2027-01', '2026-12'])).toBe('Nov 2026–Jan 2027');
    expect(formatDeductionSpan(['2026-03', '2026-05'])).toBe('Mar–May 2026');
    expect(fineHistoryDescription('Late arrival', [])).toBe('Late arrival');
    expect(fineHistoryDescription('Late arrival', ['2026-03', '2026-05'])).toBe(
      'Late arrival (deducted Mar–May 2026)'
    );
  });
});
