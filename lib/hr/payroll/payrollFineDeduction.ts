import { roundGrossToWholeDirham, roundMoney, sumMoney } from '@/lib/hr/payroll/calendar';

export type PayrollFineStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type PayrollFineDeduction = {
  id: string;
  description: string;
  amount: number;
};

export function payrollFineLineLabel(description: string): string {
  const text = description.replace(/\s+/g, ' ').trim();
  return text ? `Fine — ${text}` : 'Fine';
}

/** Approved fines with a positive amount. Pending and rejected add nothing. */
export function payablePayrollFines(
  fines: Array<{ id: string; description: string; amount: number; status: PayrollFineStatus }>
): PayrollFineDeduction[] {
  const payable: PayrollFineDeduction[] = [];
  for (const fine of fines) {
    if (fine.status !== 'APPROVED') continue;
    const amount = roundMoney(fine.amount);
    if (amount <= 0) continue;
    payable.push({ id: fine.id, description: fine.description, amount });
  }
  return payable;
}

export function sumPayrollFineAmount(fines: Array<{ amount: number }>): number {
  return sumMoney(fines.map((fine) => (fine.amount > 0 ? roundMoney(fine.amount) : 0)));
}

/**
 * Add sick-leave and payroll fines to the deduction column and subtract that
 * same total from gross once. Day rows are not an input, so they stay as they are.
 */
export function applyExtraPayrollDeductions(input: {
  gross: number;
  salaryComponentDeductions: number;
  sickFineAmount: number;
  payrollFineAmount: number;
}): { gross: number; salaryComponentDeductions: number } {
  const sick = input.sickFineAmount > 0 ? roundMoney(input.sickFineAmount) : 0;
  const payroll = input.payrollFineAmount > 0 ? roundMoney(input.payrollFineAmount) : 0;
  const extra = sumMoney([sick, payroll]);
  return {
    salaryComponentDeductions: roundMoney(input.salaryComponentDeductions + extra),
    gross: roundGrossToWholeDirham(input.gross - extra),
  };
}
