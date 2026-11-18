import { roundMoney } from '@/lib/hr/payroll/calendar';
import { rejectedSickLeaveFineAmount } from '@/lib/hr/payroll/rejectedSickLeaveFine';
import { monthlyPackageAllowance } from '@/lib/hr/payroll/salaryComponent';

describe('rejected sick leave fine', () => {
  it('cuts the entered day-rates and adds nothing for zero days', () => {
    expect(rejectedSickLeaveFineAmount(3, 3000, 600)).toBe(360);
    expect(rejectedSickLeaveFineAmount(0, 3000, 600)).toBe(0);
    expect(rejectedSickLeaveFineAmount(-2, 3000, 600)).toBe(0);
  });

  it('uses the package allowance, not only the legacy lump sum', () => {
    const allowance = monthlyPackageAllowance(
      {
        monthlyBasic: 3000,
        monthlyAllowance: 999,
        dailyRate: 0,
        salaryComponents: {
          fixedEarnings: 300,
          fixedDeductions: 50,
          attendanceEarningPerDay: 10,
          attendanceDeductionPerDay: 0,
          attendanceEarningsMonthly: 260,
          attendanceDeductionsMonthly: 0,
        },
      },
      '2026-06',
      [0]
    );
    expect(allowance).toBe(560);
    expect(rejectedSickLeaveFineAmount(1, 3000, allowance)).toBe(roundMoney(3560 / 30));
  });
});
