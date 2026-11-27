import { roundGrossToWholeDirham } from '@/lib/hr/payroll/calendar';
import {
  applyExtraPayrollDeductions,
  payablePayrollFines,
} from '@/lib/hr/payroll/payrollFineDeduction';

describe('payroll fine deductions', () => {
  const fines = [
    { id: 'a', description: 'Late', amount: 100, status: 'APPROVED' as const },
    { id: 'b', description: 'Damage', amount: 50.5, status: 'APPROVED' as const },
    { id: 'c', description: 'Waiting', amount: 80, status: 'PENDING' as const },
    { id: 'd', description: 'Dropped', amount: 40, status: 'REJECTED' as const },
  ];

  it('adds only approved fines once and leaves day rows unchanged', () => {
    const dayRows = [{ date: '2026-10-12', totalSalary: 172.22, status: 'Present' }];
    const before = dayRows.map((row) => ({ ...row }));
    const payable = payablePayrollFines(fines);
    expect(payable.map((fine) => fine.amount)).toEqual([100, 50.5]);

    const applied = applyExtraPayrollDeductions({
      gross: 1000,
      salaryComponentDeductions: 20,
      sickFineAmount: 0,
      payrollFineAmount: payable.reduce((sum, fine) => sum + fine.amount, 0),
    });

    expect(applied.salaryComponentDeductions).toBe(170.5);
    expect(applied.gross).toBe(roundGrossToWholeDirham(1000 - 150.5));
    expect(dayRows).toEqual(before);
  });

  it('stacks a sick-leave fine on top of approved payroll fines', () => {
    const applied = applyExtraPayrollDeductions({
      gross: 711.11,
      salaryComponentDeductions: 0,
      sickFineAmount: 480,
      payrollFineAmount: 100,
    });
    expect(applied.salaryComponentDeductions).toBe(580);
    expect(applied.gross).toBe(roundGrossToWholeDirham(711.11 - 580));
  });

  it('adds nothing when every fine is pending or rejected', () => {
    expect(payablePayrollFines(fines.filter((fine) => fine.status !== 'APPROVED'))).toEqual([]);
    const applied = applyExtraPayrollDeductions({
      gross: 400,
      salaryComponentDeductions: 15,
      sickFineAmount: 0,
      payrollFineAmount: 0,
    });
    expect(applied).toEqual({ gross: 400, salaryComponentDeductions: 15 });
  });
});
