import { roundMoney } from '@/lib/hr/payroll/calendar';
import { monthlyPackageAllowance } from '@/lib/hr/payroll/salaryComponent';
import type { CompensationInput } from '@/lib/hr/payroll/types';

/** Rejected sick leave is a fine: one day is (monthly basic + package allowance) / 30. */
export const SICK_LEAVE_FINE_DAY_DIVISOR = 30;

export type RejectedSickLeaveFine = {
  days: number;
  amount: number;
};

export function rejectedSickLeaveFineAmount(
  days: number,
  monthlyBasic: number,
  monthlyAllowance: number
): number {
  if (!Number.isFinite(days) || days <= 0) return 0;
  const basic = Number.isFinite(monthlyBasic) ? monthlyBasic : 0;
  const allowance = Number.isFinite(monthlyAllowance) ? monthlyAllowance : 0;
  return roundMoney((days * (basic + allowance)) / SICK_LEAVE_FINE_DAY_DIVISOR);
}

export function rejectedSickLeaveFineForPackage(params: {
  days: number;
  compensation: CompensationInput;
  month: string;
  excludedWeekdays: number[];
}): number {
  return rejectedSickLeaveFineAmount(
    params.days,
    params.compensation.monthlyBasic,
    monthlyPackageAllowance(params.compensation, params.month, params.excludedWeekdays)
  );
}
