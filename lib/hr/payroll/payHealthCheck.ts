import { roundMoney, sumMoney } from '@/lib/hr/payroll/calendar';
import { resolveExcludedWeekdays } from '@/lib/hr/payroll/payTypeConfigHelpers';
import {
  compensationWithProratedFixedMonthly,
  countAllowanceDays,
  resolveMonthlyAllowanceCap,
  resolveSalaryComponentCaps,
  resolveSalaryComponentDisplayTotals,
} from '@/lib/hr/payroll/salaryComponent';
import type {
  CompensationInput,
  PayLineInput,
  PayLineResult,
  PayTypeConfig,
} from '@/lib/hr/payroll/types';

const MONEY_TOLERANCE = 0.05;
const OT_ZERO_TOLERANCE = 0.01;

function moneyExcessTolerance(lines: PayLineInput[]): number {
  return MONEY_TOLERANCE + countAllowanceDays(lines) * 0.01;
}

function resolveBasicHourSalaryTotal(result: PayLineResult): number {
  return sumMoney(result.days.map((day) => day.basicHourSalary));
}

function appendBasicCapIssues(
  issues: string[],
  basicPaid: number,
  basicCap: number,
  result: PayLineResult,
  config: PayTypeConfig
): void {
  if (basicCap <= 0) return;

  if (basicPaid > basicCap + MONEY_TOLERANCE) {
    issues.push(
      `Basic pay ${basicPaid.toFixed(2)} exceeds assigned monthly basic ${basicCap.toFixed(2)}`
    );
  }

  if (
    (config.mode === 'MONTHLY_CALENDAR_DEDUCT' || config.mode === 'MONTHLY_FIXED') &&
    basicPaid <= basicCap + MONEY_TOLERANCE
  ) {
    const basicHourSalaryTotal = resolveBasicHourSalaryTotal(result);
    if (basicHourSalaryTotal > basicCap + MONEY_TOLERANCE) {
      issues.push(
        `Basic salary ${basicHourSalaryTotal.toFixed(2)} exceeds assigned monthly basic ${basicCap.toFixed(2)}`
      );
    }
  }
}

function appendAllowanceCapIssue(
  issues: string[],
  allowancePaid: number,
  allowanceCap: number,
  lines: PayLineInput[]
): void {
  const tolerance = moneyExcessTolerance(lines);
  if (allowanceCap > 0 && allowancePaid > allowanceCap + tolerance) {
    issues.push(
      `Allowance ${allowancePaid.toFixed(2)} exceeds assigned monthly allowance ${allowanceCap.toFixed(2)}`
    );
  }
}

export type PayHealthCheck = {
  ok: boolean;
  issues: string[];
  basicPaid: number;
  basicCap: number;
  allowancePaid: number;
  allowanceCap: number;
  componentEarningsPaid: number;
  componentEarningsCap: number;
  componentDeductionsPaid: number;
  componentDeductionsCap: number;
};

function resolveComponentCaps(
  compensation: CompensationInput,
  month: string,
  excludedWeekdays: number[],
  lines: PayLineInput[],
  config: PayTypeConfig
): { earningsCap: number; deductionsCap: number } {
  return resolveSalaryComponentCaps({ compensation, lines, month, excludedWeekdays, config });
}

function resolveDayAllowanceNetTotal(result: PayLineResult): number {
  return sumMoney(
    result.days.map((day) => {
      if (day.componentEarning != null || day.componentDeduction != null) {
        return roundMoney((day.componentEarning ?? 0) - (day.componentDeduction ?? 0));
      }
      return day.allowance;
    })
  );
}

function resolveOutsideCapPayTotal(breakdown: Record<string, number>): number {
  return roundMoney(
    (breakdown.outsideCapOt ?? 0) +
      (breakdown.holidayWorkedOt ?? 0) +
      (breakdown.excludedWeekdayOt ?? 0)
  );
}

function resolveBasicPaid(
  config: PayTypeConfig,
  compensation: CompensationInput,
  result: PayLineResult
): number {
  void compensation;

  if (config.mode === 'MONTHLY_CALENDAR_DEDUCT' || config.mode === 'MONTHLY_FIXED') {
    const outsideCapPay = resolveOutsideCapPayTotal(result.breakdown);
    const componentFixed = result.breakdown.salaryComponentsFixed ?? 0;
    const componentAttendance = result.breakdown.salaryComponentsAttendance ?? 0;
    const dayAllowanceNet = resolveDayAllowanceNetTotal(result);
    const allowanceInGross = roundMoney(
      dayAllowanceNet > 0 ? dayAllowanceNet + componentFixed : componentFixed + componentAttendance
    );
    return roundMoney(result.gross - outsideCapPay - allowanceInGross);
  }

  if (config.mode === 'HOURLY_SPLIT') {
    return sumMoney(result.days.map((day) => day.basicHourSalary));
  }

  return sumMoney(result.days.map((day) => day.basicHourSalary));
}

export function evaluatePayHealthCheck(params: {
  month: string;
  config: PayTypeConfig;
  compensation: CompensationInput;
  result: PayLineResult;
  lines: PayLineInput[];
}): PayHealthCheck {
  const { month, config, compensation, result, lines } = params;
  const issues: string[] = [];
  const excludedWeekdays = resolveExcludedWeekdays(config);

  const basicPaid = resolveBasicPaid(config, compensation, result);
  const { earningsCap, deductionsCap } = resolveComponentCaps(
    compensation,
    month,
    excludedWeekdays,
    lines,
    config
  );
  const componentTotals = resolveSalaryComponentDisplayTotals({
    compensation,
    lines,
    month,
    excludedWeekdays,
    dayRows: result.days,
    config,
  });
  const componentEarningsPaid = componentTotals.earnings;
  const componentDeductionsPaid = componentTotals.deductions;
  const allowancePaid = roundMoney(componentEarningsPaid - componentDeductionsPaid);
  const allowanceCap = resolveMonthlyAllowanceCap(compensation, month, excludedWeekdays);
  const basicCap = compensation.monthlyBasic;
  const excessTolerance = moneyExcessTolerance(lines);

  appendBasicCapIssues(issues, basicPaid, basicCap, result, config);
  appendAllowanceCapIssue(issues, allowancePaid, allowanceCap, lines);

  if (earningsCap > 0 && componentEarningsPaid > earningsCap + excessTolerance) {
    issues.push(
      `Earnings ${componentEarningsPaid.toFixed(2)} exceed assigned earnings cap ${earningsCap.toFixed(2)}`
    );
  }

  if (deductionsCap > 0 && componentDeductionsPaid > deductionsCap + excessTolerance) {
    issues.push(
      `Deductions ${componentDeductionsPaid.toFixed(2)} exceed assigned deduction cap ${deductionsCap.toFixed(2)}`
    );
  }

  for (const day of result.days) {
    if (day.otHours <= 0 && Math.abs(day.otHourSalary) >= OT_ZERO_TOLERANCE) {
      issues.push(
        `${day.date}: OT salary ${day.otHourSalary.toFixed(2)} with ${day.otHours} OT hours`
      );
    }
    const dayComponentNet =
      day.componentEarning != null || day.componentDeduction != null
        ? roundMoney((day.componentEarning ?? 0) - (day.componentDeduction ?? 0))
        : day.allowance;
    const parts = roundMoney(day.basicHourSalary + day.otHourSalary + dayComponentNet);
    if (Math.abs(parts - day.totalSalary) > MONEY_TOLERANCE) {
      issues.push(
        `${day.date}: components (${parts.toFixed(2)}) do not match day total ${day.totalSalary.toFixed(2)}`
      );
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    basicPaid,
    basicCap,
    allowancePaid,
    allowanceCap,
    componentEarningsPaid,
    componentEarningsCap: earningsCap,
    componentDeductionsPaid,
    componentDeductionsCap: deductionsCap,
  };
}

export type TimelinePackageHealthInput = {
  packageId: string;
  config: PayTypeConfig;
  compensation: CompensationInput;
  fixedMonthlyProrationFactor: number;
};

/** Health check when multiple compensation packages apply in the same month. */
export function evaluateTimelinePayHealthCheck(params: {
  month: string;
  primaryConfig: PayTypeConfig;
  packages: TimelinePackageHealthInput[];
  result: PayLineResult;
  lines: PayLineInput[];
  resolvePackageId: (line: PayLineInput) => string;
}): PayHealthCheck {
  const { month, primaryConfig, packages, result, lines, resolvePackageId } = params;
  const issues: string[] = [];

  let earningsCap = 0;
  let deductionsCap = 0;
  let componentEarningsPaid = 0;
  let componentDeductionsPaid = 0;
  let basicCap = 0;
  let allowanceCap = 0;

  for (const pkg of packages) {
    const pkgLines = lines.filter((line) => resolvePackageId(line) === pkg.packageId);
    const excludedWeekdays = resolveExcludedWeekdays(pkg.config);
    const proratedCompensation = compensationWithProratedFixedMonthly(
      pkg.compensation,
      pkg.fixedMonthlyProrationFactor
    );
    const caps = resolveComponentCaps(
      proratedCompensation,
      month,
      excludedWeekdays,
      pkgLines,
      pkg.config
    );
    earningsCap = roundMoney(earningsCap + caps.earningsCap);
    deductionsCap = roundMoney(deductionsCap + caps.deductionsCap);
    basicCap = roundMoney(
      basicCap + pkg.compensation.monthlyBasic * pkg.fixedMonthlyProrationFactor
    );
    allowanceCap = roundMoney(
      allowanceCap + resolveMonthlyAllowanceCap(proratedCompensation, month, excludedWeekdays)
    );

    const pkgDayRows = result.days.filter((day) =>
      pkgLines.some((line) => line.workDate === day.date)
    );
    const totals = resolveSalaryComponentDisplayTotals({
      compensation: proratedCompensation,
      lines: pkgLines,
      month,
      excludedWeekdays,
      dayRows: pkgDayRows,
      config: pkg.config,
    });
    componentEarningsPaid = roundMoney(componentEarningsPaid + totals.earnings);
    componentDeductionsPaid = roundMoney(componentDeductionsPaid + totals.deductions);
  }

  const basicPaid = resolveBasicPaid(primaryConfig, packages[packages.length - 1]?.compensation ?? {
    monthlyBasic: 0,
    monthlyAllowance: 0,
    dailyRate: 0,
  }, result);
  const allowancePaid = roundMoney(componentEarningsPaid - componentDeductionsPaid);
  const excessTolerance = moneyExcessTolerance(lines);

  appendBasicCapIssues(issues, basicPaid, basicCap, result, primaryConfig);
  appendAllowanceCapIssue(issues, allowancePaid, allowanceCap, lines);

  if (earningsCap > 0 && componentEarningsPaid > earningsCap + excessTolerance) {
    issues.push(
      `Earnings ${componentEarningsPaid.toFixed(2)} exceed assigned earnings cap ${earningsCap.toFixed(2)}`
    );
  }

  if (deductionsCap > 0 && componentDeductionsPaid > deductionsCap + excessTolerance) {
    issues.push(
      `Deductions ${componentDeductionsPaid.toFixed(2)} exceed assigned deduction cap ${deductionsCap.toFixed(2)}`
    );
  }

  for (const day of result.days) {
    if (day.otHours <= 0 && Math.abs(day.otHourSalary) >= OT_ZERO_TOLERANCE) {
      issues.push(
        `${day.date}: OT salary ${day.otHourSalary.toFixed(2)} with ${day.otHours} OT hours`
      );
    }
    const dayComponentNet =
      day.componentEarning != null || day.componentDeduction != null
        ? roundMoney((day.componentEarning ?? 0) - (day.componentDeduction ?? 0))
        : day.allowance;
    const parts = roundMoney(day.basicHourSalary + day.otHourSalary + dayComponentNet);
    if (Math.abs(parts - day.totalSalary) > MONEY_TOLERANCE) {
      issues.push(
        `${day.date}: components (${parts.toFixed(2)}) do not match day total ${day.totalSalary.toFixed(2)}`
      );
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    basicPaid,
    basicCap,
    allowancePaid,
    allowanceCap,
    componentEarningsPaid,
    componentEarningsCap: earningsCap,
    componentDeductionsPaid,
    componentDeductionsCap: deductionsCap,
  };
}
