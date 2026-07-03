import { dedupeAllowancesByType } from '@/lib/hr/payroll/allowanceTotals';
import {
  centsToMoney,
  denomDaysExcludingWeekdays,
  moneyToCents,
  roundMoney,
  sumMoney,
} from '@/lib/hr/payroll/calendar';
import { shouldPayExcludedWeekdayWorkAtOtOnly } from '@/lib/hr/payroll/excludedWeekdayOtPay';
import { isPayrollHolidayLine } from '@/lib/hr/payroll/holidayPayLine';
import type { CompensationInput, PayLineInput, PayTypeConfig } from '@/lib/hr/payroll/types';
import type { EmployeeAllowanceItem } from '@/lib/hr/payroll/resolveEmployeeAllowances';

export type SalaryComponentKind = 'EARNING' | 'DEDUCTION';
export type SalaryComponentApplication = 'FIXED_MONTHLY' | 'ATTENDANCE_PRESENT';

export type SalaryComponentItem = {
  amount: number;
  componentKind: SalaryComponentKind;
  applicationMode: SalaryComponentApplication;
};

export type SalaryComponentTotals = {
  fixedEarnings: number;
  fixedDeductions: number;
  attendanceEarningPerDay: number;
  attendanceDeductionPerDay: number;
  attendanceEarningsMonthly: number;
  attendanceDeductionsMonthly: number;
};

export function prorateSalaryComponentTotals(
  totals: SalaryComponentTotals,
  factor: number
): SalaryComponentTotals {
  if (factor >= 1) return totals;
  if (factor <= 0) {
    return {
      fixedEarnings: 0,
      fixedDeductions: 0,
      attendanceEarningPerDay: totals.attendanceEarningPerDay,
      attendanceDeductionPerDay: totals.attendanceDeductionPerDay,
      attendanceEarningsMonthly: 0,
      attendanceDeductionsMonthly: 0,
    };
  }
  return {
    fixedEarnings: roundMoney(totals.fixedEarnings * factor),
    fixedDeductions: roundMoney(totals.fixedDeductions * factor),
    attendanceEarningPerDay: totals.attendanceEarningPerDay,
    attendanceDeductionPerDay: totals.attendanceDeductionPerDay,
    attendanceEarningsMonthly: totals.attendanceEarningsMonthly,
    attendanceDeductionsMonthly: totals.attendanceDeductionsMonthly,
  };
}

export function compensationWithProratedFixedMonthly(
  compensation: CompensationInput,
  factor: number | undefined
): CompensationInput {
  if (factor == null || factor >= 1 || !compensation.salaryComponents) return compensation;
  return {
    ...compensation,
    salaryComponents: prorateSalaryComponentTotals(compensation.salaryComponents, factor),
  };
}

export function buildSalaryComponentTotals(
  items: SalaryComponentItem[],
  month: string,
  excludedWeekdays: number[]
): SalaryComponentTotals {
  const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
  let fixedEarnings = 0;
  let fixedDeductions = 0;
  let attendanceEarningPerDay = 0;
  let attendanceDeductionPerDay = 0;
  let attendanceEarningsMonthly = 0;
  let attendanceDeductionsMonthly = 0;

  for (const item of items) {
    if (item.componentKind === 'DEDUCTION') {
      if (item.applicationMode === 'FIXED_MONTHLY') {
        fixedDeductions += item.amount;
      } else {
        attendanceDeductionsMonthly += item.amount;
        attendanceDeductionPerDay += item.amount / denom;
      }
    } else if (item.applicationMode === 'FIXED_MONTHLY') {
      fixedEarnings += item.amount;
    } else {
      attendanceEarningsMonthly += item.amount;
      attendanceEarningPerDay += item.amount / denom;
    }
  }

  return {
    fixedEarnings: roundMoney(fixedEarnings),
    fixedDeductions: roundMoney(fixedDeductions),
    attendanceEarningPerDay,
    attendanceDeductionPerDay,
    attendanceEarningsMonthly: roundMoney(attendanceEarningsMonthly),
    attendanceDeductionsMonthly: roundMoney(attendanceDeductionsMonthly),
  };
}

export function countPresentDays(lines: PayLineInput[]): number {
  return lines.filter((line) => line.status === 'PRESENT').length;
}

/** Days that earn per-day attendance allowance (present, half day, paid holiday). */
export function countAllowanceDays(lines: PayLineInput[]): number {
  return lines.filter(
    (line) =>
      line.status === 'PRESENT' ||
      line.status === 'HALF_DAY' ||
      isPayrollHolidayLine(line)
  ).length;
}

export function lineEarnsAttendanceComponentInPay(
  line: PayLineInput,
  config?: PayTypeConfig
): boolean {
  const earnsDay =
    line.status === 'PRESENT' ||
    line.status === 'HALF_DAY' ||
    isPayrollHolidayLine(line);
  if (!earnsDay) return false;
  if (config && shouldPayExcludedWeekdayWorkAtOtOnly(line, config)) return false;
  return true;
}

export type AttendanceComponentSplit = { earning: number; deduction: number };

function reconcileDistributedCents(totalCents: number, cents: number[]): number[] {
  if (cents.length === 0) return cents;
  const reconciled = [...cents];
  const allocated = reconciled.reduce((sum, value) => sum + value, 0);
  const drift = totalCents - allocated;
  if (drift !== 0) {
    reconciled[reconciled.length - 1] += drift;
  }
  return reconciled;
}

/** Split a money total across units so row sums match the total exactly (2-decimal cents). */
export function distributeMoneyAcrossUnits(total: number, unitCount: number): number[] {
  if (unitCount <= 0) return [];
  const totalCents = moneyToCents(total);
  let remaining = totalCents;
  const cents: number[] = [];
  for (let i = 0; i < unitCount; i += 1) {
    const slotsLeft = unitCount - i;
    const shareCents = Math.floor(remaining / slotsLeft);
    cents.push(shareCents);
    remaining -= shareCents;
  }
  return reconcileDistributedCents(totalCents, cents).map((value) => centsToMoney(value));
}

/** Distribute a capped total across rows in proportion to each row's contribution weight. */
export function distributeMoneyByContribution(total: number, contributions: number[]): number[] {
  if (contributions.length === 0) return [];
  const totalCents = moneyToCents(total);
  const weightSum = contributions.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0) return contributions.map(() => 0);

  const rawCents = contributions.map((weight) => (totalCents * weight) / weightSum);
  const floors = rawCents.map((value) => Math.floor(value));
  let allocated = floors.reduce((sum, value) => sum + value, 0);
  let leftover = totalCents - allocated;
  const ranked = rawCents
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  const cents = [...floors];
  for (let i = 0; i < leftover; i += 1) {
    cents[ranked[i].index] += 1;
  }
  return reconcileDistributedCents(totalCents, cents).map((value) => centsToMoney(value));
}

function resolveAttendanceEarningsMonthly(
  comps: SalaryComponentTotals,
  month: string,
  excludedWeekdays: number[]
): number {
  if (comps.attendanceEarningsMonthly > 0) return comps.attendanceEarningsMonthly;
  const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
  return roundMoney(comps.attendanceEarningPerDay * denom);
}

function resolveAttendanceDeductionsMonthly(
  comps: SalaryComponentTotals,
  month: string,
  excludedWeekdays: number[]
): number {
  if (comps.attendanceDeductionsMonthly > 0) return comps.attendanceDeductionsMonthly;
  const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
  return roundMoney(comps.attendanceDeductionPerDay * denom);
}

function resolvePeriodAttendanceAmount(
  monthlyAmount: number,
  earnedEligibleDays: number,
  denomDays: number
): number {
  if (monthlyAmount <= 0 || earnedEligibleDays <= 0 || denomDays <= 0) return 0;
  const prorated = (monthlyAmount * earnedEligibleDays) / denomDays;
  return roundMoney(Math.min(monthlyAmount, prorated));
}

export function resolvePackagePeriodAttendanceNet(params: {
  compensation: CompensationInput;
  earnedEligibleDays: number;
  month: string;
  excludedWeekdays: number[];
}): number {
  const { compensation, earnedEligibleDays, month, excludedWeekdays } = params;
  const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
  const comps = compensation.salaryComponents;
  if (!comps) {
    return resolvePeriodAttendanceAmount(compensation.monthlyAllowance, earnedEligibleDays, denom);
  }
  const earnings = resolvePeriodAttendanceAmount(
    resolveAttendanceEarningsMonthly(comps, month, excludedWeekdays),
    earnedEligibleDays,
    denom
  );
  const deductions = resolvePeriodAttendanceAmount(
    resolveAttendanceDeductionsMonthly(comps, month, excludedWeekdays),
    earnedEligibleDays,
    denom
  );
  return roundMoney(earnings - deductions);
}
export function buildAttendanceComponentSplitMap(params: {
  compensation: CompensationInput;
  lines: PayLineInput[];
  month: string;
  excludedWeekdays: number[];
  config?: PayTypeConfig;
}): Map<string, AttendanceComponentSplit> {
  const { compensation, lines, month, excludedWeekdays, config } = params;
  const eligible = lines.filter((line) => lineEarnsAttendanceComponentInPay(line, config));
  const map = new Map<string, AttendanceComponentSplit>();
  if (eligible.length === 0) return map;

  const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
  const comps = compensation.salaryComponents;
  let earningAmounts: number[];
  let deductionAmounts: number[];

  if (!comps) {
    const periodEarnings = resolvePeriodAttendanceAmount(
      compensation.monthlyAllowance,
      eligible.length,
      denom
    );
    earningAmounts = distributeMoneyAcrossUnits(periodEarnings, eligible.length);
    deductionAmounts = eligible.map(() => 0);
  } else {
    const periodEarnings = resolvePeriodAttendanceAmount(
      resolveAttendanceEarningsMonthly(comps, month, excludedWeekdays),
      eligible.length,
      denom
    );
    const periodDeductions = resolvePeriodAttendanceAmount(
      resolveAttendanceDeductionsMonthly(comps, month, excludedWeekdays),
      eligible.length,
      denom
    );
    earningAmounts = distributeMoneyAcrossUnits(periodEarnings, eligible.length);
    deductionAmounts = distributeMoneyAcrossUnits(periodDeductions, eligible.length);
  }

  eligible.forEach((line, index) => {
    map.set(line.workDate, {
      earning: earningAmounts[index] ?? 0,
      deduction: deductionAmounts[index] ?? 0,
    });
  });
  return map;
}

export function resolvePerDayComponentSplit(params: {
  line: PayLineInput;
  compensation: CompensationInput;
  month: string;
  excludedWeekdays: number[];
  lines?: PayLineInput[];
  config?: PayTypeConfig;
  splitMap?: Map<string, AttendanceComponentSplit>;
}): AttendanceComponentSplit {
  const { line, compensation, month, excludedWeekdays, lines, config, splitMap } = params;
  if (!lineEarnsAttendanceComponentInPay(line, config)) {
    return { earning: 0, deduction: 0 };
  }

  const map =
    splitMap ??
    (lines
      ? buildAttendanceComponentSplitMap({
          compensation,
          lines,
          month,
          excludedWeekdays,
          config,
        })
      : null);
  if (map) {
    return map.get(line.workDate) ?? { earning: 0, deduction: 0 };
  }

  const comps = compensation.salaryComponents;
  const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
  let earning = 0;
  let deduction = 0;

  if (!comps && compensation.monthlyAllowance > 0 && denom > 0) {
    earning += compensation.monthlyAllowance / denom;
  }
  if (comps) {
    earning += comps.attendanceEarningPerDay;
    deduction += comps.attendanceDeductionPerDay;
  }

  return {
    earning: roundMoney(earning),
    deduction: roundMoney(deduction),
  };
}

export function resolvePerDayAllowance(params: {
  line: PayLineInput;
  compensation: CompensationInput;
  month: string;
  excludedWeekdays: number[];
}): number {
  const { earning, deduction } = resolvePerDayComponentSplit(params);
  return roundMoney(earning - deduction);
}

export function resolveSalaryComponentCaps(params: {
  compensation: CompensationInput;
  lines: PayLineInput[];
  month: string;
  excludedWeekdays: number[];
  config?: PayTypeConfig;
}): { earningsCap: number; deductionsCap: number } {
  const { compensation, lines, month, excludedWeekdays, config } = params;
  const comps = compensation.salaryComponents;
  const eligibleCount = lines.filter((line) => lineEarnsAttendanceComponentInPay(line, config)).length;
  const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);

  if (!comps) {
    const periodEarnings = resolvePeriodAttendanceAmount(
      compensation.monthlyAllowance,
      eligibleCount,
      denom
    );
    return { earningsCap: periodEarnings, deductionsCap: 0 };
  }

  const periodAttendanceEarnings = resolvePeriodAttendanceAmount(
    resolveAttendanceEarningsMonthly(comps, month, excludedWeekdays),
    eligibleCount,
    denom
  );
  const periodAttendanceDeductions = resolvePeriodAttendanceAmount(
    resolveAttendanceDeductionsMonthly(comps, month, excludedWeekdays),
    eligibleCount,
    denom
  );

  return {
    earningsCap: roundMoney(comps.fixedEarnings + periodAttendanceEarnings),
    deductionsCap: roundMoney(comps.fixedDeductions + periodAttendanceDeductions),
  };
}

/** Full-month assigned allowance (net of fixed + attendance components), for health-check display caps. */
export function resolveMonthlyAllowanceCap(
  compensation: CompensationInput,
  month: string,
  excludedWeekdays: number[]
): number {
  const comps = compensation.salaryComponents;
  if (!comps) {
    return roundMoney(Math.max(0, compensation.monthlyAllowance));
  }
  const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
  const attendanceEarningsMonthly =
    comps.attendanceEarningsMonthly ??
    roundMoney(comps.attendanceEarningPerDay * denom);
  const attendanceDeductionsMonthly =
    comps.attendanceDeductionsMonthly ??
    roundMoney(comps.attendanceDeductionPerDay * denom);
  const attendanceNet = roundMoney(attendanceEarningsMonthly - attendanceDeductionsMonthly);
  return roundMoney(Math.max(0, comps.fixedEarnings - comps.fixedDeductions + attendanceNet));
}

export function resolveSalaryComponentDisplayTotals(params: {
  compensation: CompensationInput;
  lines: PayLineInput[];
  month: string;
  excludedWeekdays: number[];
  dayRows: Array<{ componentEarning?: number; componentDeduction?: number; allowance: number }>;
  config?: PayTypeConfig;
}): { earnings: number; deductions: number } {
  const { compensation, lines, month, excludedWeekdays, dayRows, config } = params;
  const comps = compensation.salaryComponents;

  if (!comps) {
    const earnings = sumMoney(
      dayRows.map((day) => day.componentEarning ?? Math.max(0, day.allowance))
    );
    return { earnings, deductions: 0 };
  }

  const hasSplitOnDays = dayRows.some(
    (day) => (day.componentEarning ?? 0) > 0 || (day.componentDeduction ?? 0) > 0
  );

  if (hasSplitOnDays) {
    return {
      earnings: roundMoney(
        comps.fixedEarnings + sumMoney(dayRows.map((day) => day.componentEarning ?? 0))
      ),
      deductions: roundMoney(
        comps.fixedDeductions + sumMoney(dayRows.map((day) => day.componentDeduction ?? 0))
      ),
    };
  }

  const caps = resolveSalaryComponentCaps({ compensation, lines, month, excludedWeekdays, config });
  return { earnings: caps.earningsCap, deductions: caps.deductionsCap };
}

export function netSignedComponentAmount(
  amount: number,
  componentKind: SalaryComponentKind
): number {
  return componentKind === 'DEDUCTION' ? -amount : amount;
}

export function netSalaryComponentTotal(
  items: Array<{ amount: number; componentKind: SalaryComponentKind }>
): number {
  return roundMoney(
    items.reduce((sum, item) => sum + netSignedComponentAmount(item.amount, item.componentKind), 0)
  );
}

export function fixedSalaryComponentNet(totals: SalaryComponentTotals): number {
  return roundMoney(totals.fixedEarnings - totals.fixedDeductions);
}

export function attendanceSalaryComponentNet(
  totals: SalaryComponentTotals,
  earnedEligibleDays: number,
  denomDays: number,
  month?: string,
  excludedWeekdays?: number[]
): number {
  const earningsMonthly =
    month && excludedWeekdays
      ? resolveAttendanceEarningsMonthly(totals, month, excludedWeekdays)
      : totals.attendanceEarningsMonthly;
  const deductionsMonthly =
    month && excludedWeekdays
      ? resolveAttendanceDeductionsMonthly(totals, month, excludedWeekdays)
      : totals.attendanceDeductionsMonthly;
  const earnings = resolvePeriodAttendanceAmount(earningsMonthly, earnedEligibleDays, denomDays);
  const deductions = resolvePeriodAttendanceAmount(deductionsMonthly, earnedEligibleDays, denomDays);
  return roundMoney(earnings - deductions);
}

/** Applies fixed + attendance-based components after base pay calculation (non–hourly-split modes). */
export function applySalaryComponentsToGross(params: {
  gross: number;
  compensation: CompensationInput;
  lines: PayLineInput[];
  breakdown: Record<string, number>;
  month: string;
  excludedWeekdays: number[];
  config?: PayTypeConfig;
  /** When true, per-day attendance allowance is already on day rows — only fixed monthly components are added here. */
  attendanceOnDayRows?: boolean;
}): number {
  const totals = params.compensation.salaryComponents;
  if (!totals) return params.gross;

  const earnedEligibleDays = params.lines.filter((line) =>
    lineEarnsAttendanceComponentInPay(line, params.config)
  ).length;
  const denom = denomDaysExcludingWeekdays(params.month, params.excludedWeekdays);
  const fixedNet = fixedSalaryComponentNet(totals);
  const attendanceNet = attendanceSalaryComponentNet(
    totals,
    earnedEligibleDays,
    denom,
    params.month,
    params.excludedWeekdays
  );

  if (fixedNet !== 0) params.breakdown.salaryComponentsFixed = fixedNet;
  if (!params.attendanceOnDayRows && attendanceNet !== 0) {
    params.breakdown.salaryComponentsAttendance = attendanceNet;
  }

  return roundMoney(params.gross + fixedNet + (params.attendanceOnDayRows ? 0 : attendanceNet));
}

export function buildCompensationInputFromAllowances(
  row: {
    monthlyBasic: { toString(): string } | number | null;
    monthlyAllowance: { toString(): string } | number | null;
    dailyRate: { toString(): string } | number | null;
  },
  allowanceItems: EmployeeAllowanceItem[],
  month: string,
  excludedWeekdays: number[]
): CompensationInput {
  const legacyAllowance = Number(row.monthlyAllowance ?? 0);
  const deduped = dedupeAllowancesByType(allowanceItems);

  if (deduped.length > 0) {
    return {
      monthlyBasic: Number(row.monthlyBasic ?? 0),
      monthlyAllowance: 0,
      dailyRate: Number(row.dailyRate ?? 0),
      salaryComponents: buildSalaryComponentTotals(
        deduped.map((item) => ({
          amount: item.amount,
          componentKind: item.componentKind,
          applicationMode: item.applicationMode,
        })),
        month,
        excludedWeekdays
      ),
    };
  }

  return {
    monthlyBasic: Number(row.monthlyBasic ?? 0),
    monthlyAllowance: legacyAllowance,
    dailyRate: Number(row.dailyRate ?? 0),
  };
}
