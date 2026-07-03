import { isPayrollLeaveLine } from '@/lib/hr/attendanceLeavePay';
import { isPayrollHolidayLine } from '@/lib/hr/payroll/holidayPayLine';
import { holidayDayPayAmount } from '@/lib/hr/payroll/resolveHolidayPayStructure';
import {
  buildPaidHolidayDayRow,
  holidayWorkedOtPay,
  shouldPayHolidayWorkedOt,
} from '@/lib/hr/payroll/holidayWorkedOtPay';
import {
  buildExcludedWeekdayInfoDayRow,
  buildExcludedWeekdayWorkDayRow,
  buildExcludedWeekdayWorkDayRowWithOtRate,
  shouldPayExcludedWeekdayWorkAtOtOnly,
} from '@/lib/hr/payroll/excludedWeekdayOtPay';
import { isPaidLeaveType } from '@/lib/hr/leaveTypes';
import type { Prisma } from '@prisma/client';
import {
  daysInMonth,
  denomDaysExcludingWeekdays,
  isExcludedWeekdayYmd,
  isSundayYmd,
  roundMoney,
  sumMoney,
} from '@/lib/hr/payroll/calendar';
import { evaluateCustomFormula } from '@/lib/hr/payroll/evaluateCustomFormula';
import { resolveWorkedMinutesFromAttendance } from '@/lib/hr/payroll/resolveWorkedMinutes';
import { lineBasicHours } from '@/lib/hr/payroll/lineBasicHours';
import {
  emptyPayDayBreakdown,
  finishPayDayBreakdown,
  formatPayDayStatus,
  isExcludedWeekdayLine,
  isLeavePaidForPay,
  mergeCustomDayTrace,
  resolveDayHoursForBreakdown,
  sortPayDayBreakdowns,
  splitBasicOtSalary,
  workedHoursFromMinutes,
} from '@/lib/hr/payroll/payDayBreakdown';
import {
  resolveExcludedWeekdays,
  resolveOtPercent,
  resolveCalendarDeductDayCount,
  resolveDeductDenominator,
} from '@/lib/hr/payroll/payTypeConfigHelpers';
import {
  applySalaryComponentsToGross,
  buildAttendanceComponentSplitMap,
  distributeMoneyByContribution,
  fixedSalaryComponentNet,
  lineEarnsAttendanceComponentInPay,
  prorateSalaryComponentTotals,
  resolvePackagePeriodAttendanceNet,
  resolvePerDayAllowance,
  resolvePerDayComponentSplit,
  type AttendanceComponentSplit,
} from '@/lib/hr/payroll/salaryComponent';
import type {
  CompensationInput,
  LinePayContext,
  PayDayBreakdown,
  PayLineInput,
  PayLineResult,
  PayTypeConfig,
} from '@/lib/hr/payroll/types';

function applyFixedSalaryComponentsPerPackage(params: {
  gross: number;
  lines: PayLineInput[];
  breakdown: Record<string, number>;
  lineCtx: (line: PayLineInput) => LinePayContext;
}): number {
  const seen = new Set<string>();
  let gross = params.gross;
  let fixedNetTotal = 0;

  for (const line of params.lines) {
    const ctx = params.lineCtx(line);
    const key = ctx.packageId ?? 'default';
    if (seen.has(key)) continue;
    seen.add(key);

    const comps = ctx.compensation.salaryComponents;
    if (!comps) continue;

    const factor = ctx.fixedMonthlyProrationFactor;
    const prorated =
      factor != null && factor < 1 ? prorateSalaryComponentTotals(comps, factor) : comps;
    const fixedNet = fixedSalaryComponentNet(prorated);
    if (fixedNet === 0) continue;

    fixedNetTotal = roundMoney(fixedNetTotal + fixedNet);
    gross = roundMoney(gross + fixedNet);
  }

  if (fixedNetTotal !== 0) params.breakdown.salaryComponentsFixed = fixedNetTotal;
  return gross;
}

function groupLinesByPackage(
  lines: PayLineInput[],
  lineCtx: (line: PayLineInput) => LinePayContext
): Map<string, PayLineInput[]> {
  const grouped = new Map<string, PayLineInput[]>();
  for (const line of lines) {
    const key = lineCtx(line).packageId ?? 'default';
    const bucket = grouped.get(key) ?? [];
    bucket.push(line);
    grouped.set(key, bucket);
  }
  return grouped;
}

function getAttendanceSplitMap(
  cache: Map<string, Map<string, AttendanceComponentSplit>>,
  key: string,
  ctx: LinePayContext,
  packageLines: PayLineInput[],
  month: string
): Map<string, AttendanceComponentSplit> {
  if (!cache.has(key)) {
    cache.set(
      key,
      buildAttendanceComponentSplitMap({
        compensation: ctx.compensation,
        lines: packageLines,
        month,
        excludedWeekdays: resolveExcludedWeekdays(ctx.config),
        config: ctx.config,
      })
    );
  }
  return cache.get(key)!;
}

function isInsideCalendarDeductBasicRow(
  line: PayLineInput,
  row: PayDayBreakdown,
  config: PayTypeConfig
): boolean {
  if (row.basicHourSalary <= 0) return false;
  if (shouldPayHolidayWorkedOt(line)) return false;
  if (shouldPayExcludedWeekdayWorkAtOtOnly(line, config)) return false;
  if (isPayrollHolidayLine(line) && line.holidayPayTypeConfig) return false;
  return true;
}

function calendarDeductBasicWeight(line: PayLineInput): number {
  if (isPayrollLeaveLine(line)) {
    return (line.leavePayPercent ?? 100) / 100;
  }
  return 1;
}

function redistributeCalendarDeductBasicOnRows(
  lines: PayLineInput[],
  dayRows: PayDayBreakdown[],
  lineCtx: (line: PayLineInput) => LinePayContext,
  month: string
): void {
  const rowsByPackage = groupLinesByPackage(lines, lineCtx);

  for (const packageLines of rowsByPackage.values()) {
    const ctx = lineCtx(packageLines[0]);
    const rowIndices = packageLines.map((line) => lines.indexOf(line));
    const monthlyBasic = ctx.compensation.monthlyBasic;
    const deductDaysInMonth = resolveCalendarDeductDayCount(month, ctx.config);
    const insideIndices = rowIndices.filter((index) =>
      isInsideCalendarDeductBasicRow(lines[index], dayRows[index], ctx.config)
    );
    if (insideIndices.length === 0 || deductDaysInMonth <= 0) continue;

    const weights = insideIndices.map((index) => calendarDeductBasicWeight(lines[index]));
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    if (weightSum <= 0) continue;

    const cappedWeightSum = Math.min(weightSum, deductDaysInMonth);
    const periodBasicTotal = roundMoney((monthlyBasic * cappedWeightSum) / deductDaysInMonth);
    const amounts = distributeMoneyByContribution(periodBasicTotal, weights);

    insideIndices.forEach((rowIndex, amountIndex) => {
      const row = dayRows[rowIndex];
      const delta = roundMoney(amounts[amountIndex] - row.basicHourSalary);
      row.basicHourSalary = amounts[amountIndex];
      row.totalSalary = roundMoney(row.totalSalary + delta);
    });
  }
}

function redistributeHourlySplitBasicOnRows(
  lines: PayLineInput[],
  dayRows: PayDayBreakdown[],
  lineCtx: (line: PayLineInput) => LinePayContext
): void {
  const rowsByPackage = groupLinesByPackage(lines, lineCtx);

  for (const packageLines of rowsByPackage.values()) {
    const rowIndices = packageLines
      .map((line) => lines.indexOf(line))
      .filter((index) => dayRows[index].basicHourSalary > 0);
    if (rowIndices.length === 0) continue;

    const monthlyBasic = lineCtx(packageLines[0]).compensation.monthlyBasic;
    const contributions = rowIndices.map((index) => dayRows[index].basicHourSalary);
    const uncappedTotal = roundMoney(contributions.reduce((sum, value) => sum + value, 0));
    const cappedTotal = roundMoney(Math.min(uncappedTotal, monthlyBasic));
    if (cappedTotal >= uncappedTotal) continue;

    const amounts = distributeMoneyByContribution(cappedTotal, contributions);
    rowIndices.forEach((rowIndex, amountIndex) => {
      const row = dayRows[rowIndex];
      const delta = roundMoney(amounts[amountIndex] - row.basicHourSalary);
      row.basicHourSalary = amounts[amountIndex];
      row.totalSalary = roundMoney(row.totalSalary + delta);
    });
  }
}

function syncCalendarDeductAllowanceOnRows(
  lines: PayLineInput[],
  dayRows: PayDayBreakdown[],
  lineCtx: (line: PayLineInput) => LinePayContext,
  month: string,
  attendanceSplitCache: Map<string, Map<string, AttendanceComponentSplit>>
): void {
  for (const [packageKey, packageLines] of groupLinesByPackage(lines, lineCtx)) {
    const ctx = lineCtx(packageLines[0]);
    const splitMap = attendanceSplitCache.get(packageKey);
    if (!splitMap) continue;

    const allowanceRowIndices: number[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if ((lineCtx(line).packageId ?? 'default') !== packageKey) continue;
      if (!lineEarnsAttendanceComponentInPay(line, ctx.config)) continue;
      const split = splitMap.get(line.workDate);
      if (!split) continue;

      const row = dayRows[index];
      const nextAllowance = roundMoney(split.earning - split.deduction);
      const delta = roundMoney(nextAllowance - row.allowance);
      row.componentEarning = split.earning;
      row.componentDeduction = split.deduction;
      if (delta !== 0) {
        row.allowance = nextAllowance;
        row.totalSalary = roundMoney(row.totalSalary + delta);
      } else {
        row.allowance = nextAllowance;
      }
      allowanceRowIndices.push(index);
    }

    if (allowanceRowIndices.length === 0) continue;

    const periodAllowanceNet = resolvePackagePeriodAttendanceNet({
      compensation: ctx.compensation,
      earnedEligibleDays: allowanceRowIndices.length,
      month,
      excludedWeekdays: resolveExcludedWeekdays(ctx.config),
    });
    const currentAllowanceNet = sumMoney(allowanceRowIndices.map((index) => dayRows[index].allowance));
    const drift = roundMoney(periodAllowanceNet - currentAllowanceNet);
    if (drift === 0) continue;

    const rowIndex = allowanceRowIndices[allowanceRowIndices.length - 1];
    const row = dayRows[rowIndex];
    row.allowance = roundMoney(row.allowance + drift);
    row.componentEarning = roundMoney((row.componentEarning ?? 0) + drift);
    row.totalSalary = roundMoney(row.totalSalary + drift);
  }
}

function dailyWagePay(
  dailyRate: number,
  basicHours: number,
  workedHours: number,
  otPercent: number
): number {
  if (workedHours <= 0 || basicHours <= 0) return 0;
  const basicRate = dailyRate / basicHours;
  const otRate = basicRate * (otPercent / 100);
  if (workedHours >= basicHours) {
    return roundMoney(dailyRate + (workedHours - basicHours) * otRate);
  }
  return roundMoney(workedHours * basicRate);
}

function buildDailyWageDayRow(
  line: PayLineInput,
  dailyRate: number,
  otPercent: number,
  month: string,
  compensation: CompensationInput,
  config: PayTypeConfig
): PayDayBreakdown {
  if (isPayrollHolidayLine(line)) {
    const lineBasic = lineBasicHours(line);
    const basicHourRate = lineBasic ? dailyRate / lineBasic : 0;
    return buildPaidHolidayDayRow({
      line,
      month,
      employeeDailyRate: dailyRate,
      basicHourRate,
      compensation,
      employeeConfig: config,
    });
  }

  if ((line.status === 'ABSENT' || isPayrollLeaveLine(line)) && !isLeavePaidForPay(line)) {
    return emptyPayDayBreakdown(line);
  }

  const lineBasic = lineBasicHours(line);
  if (!lineBasic) return emptyPayDayBreakdown(line);

  if (shouldPayExcludedWeekdayWorkAtOtOnly(line, config)) {
    const basicHourRate = dailyRate / lineBasic;
    return buildExcludedWeekdayWorkDayRow(line, basicHourRate, otPercent, config);
  }

  const workedHours = workedHoursFromMinutes(line.workedMinutes);
  const basicHourRate = roundMoney(dailyRate / lineBasic);
  const otHourRate = roundMoney(basicHourRate * (otPercent / 100));
  const basicHours = Math.min(workedHours, lineBasic);
  const otHours = Math.max(0, workedHours - lineBasic);
  const totalSalary = dailyWagePay(dailyRate, lineBasic, workedHours, otPercent);
  const { basicHourSalary, otHourSalary } = splitBasicOtSalary({
    totalSalary,
    basicHours,
    otHours,
    basicHourRate,
    otHourRate,
  });

  return finishPayDayBreakdown({
    date: line.workDate,
    status: formatPayDayStatus(line),
    totalHours: workedHours,
    basicHours,
    otHours,
    basicHourRate,
    basicHourSalary,
    otHourRate,
    otHourSalary,
    allowance: 0,
    totalSalary,
    detail: `${workedHours}h`,
  });
}

function buildHourlySplitDayRow(
  line: PayLineInput,
  params: {
    basic: number;
    denom: number;
    compensation: CompensationInput;
    month: string;
    excludedWeekdays: number[];
    config: PayTypeConfig;
    splitMap: Map<string, AttendanceComponentSplit>;
    packageLines: PayLineInput[];
  }
): PayDayBreakdown {
  const {
    compensation,
    month,
    excludedWeekdays,
    config,
    splitMap,
    packageLines,
  } = params;

  if (line.status === 'ABSENT' && !isPayrollLeaveLine(line)) {
    return emptyPayDayBreakdown(line);
  }

  if (isPayrollLeaveLine(line)) {
    if (!isLeavePaidForPay(line)) {
      return emptyPayDayBreakdown(line);
    }
    return emptyPayDayBreakdown(line);
  }

  const lineBasic = lineBasicHours(line);
  if (!lineBasic) return emptyPayDayBreakdown(line);

  const workedHours = workedHoursFromMinutes(line.workedMinutes);
  if (shouldPayExcludedWeekdayWorkAtOtOnly(line, config)) {
    const otHourRateRaw = (params.basic * 12) / 365 / lineBasic;
    return buildExcludedWeekdayWorkDayRowWithOtRate(line, otHourRateRaw, config);
  }

  if (workedHours <= 0 && !isPayrollLeaveLine(line)) {
    return emptyPayDayBreakdown(line);
  }

  const lineBasicRateRaw = params.basic / params.denom / lineBasic;
  const otHourRateRaw = (params.basic * 12) / 365 / lineBasic;
  const basicHourRate = roundMoney(lineBasicRateRaw);
  const otHourRate = roundMoney(otHourRateRaw);
  const basicHours = Math.min(workedHours, lineBasic);
  const otHours = Math.max(0, workedHours - lineBasic);
  const { earning: componentEarning, deduction: componentDeduction } = resolvePerDayComponentSplit({
    line,
    compensation,
    month,
    excludedWeekdays,
    lines: packageLines,
    config,
    splitMap,
  });
  const allowance = roundMoney(componentEarning - componentDeduction);
  const payBeforeAllowance = roundMoney(basicHours * lineBasicRateRaw + otHours * otHourRateRaw);
  const { basicHourSalary, otHourSalary } = splitBasicOtSalary({
    totalSalary: payBeforeAllowance,
    basicHours,
    otHours,
    basicHourRate,
    otHourRate,
  });
  const allowanceRounded = roundMoney(allowance);
  const totalSalaryRounded = roundMoney(payBeforeAllowance + allowanceRounded);

  return finishPayDayBreakdown({
    date: line.workDate,
    status: 'Present',
    totalHours: workedHours,
    basicHours,
    otHours,
    basicHourRate,
    basicHourSalary,
    otHourRate,
    otHourSalary,
    allowance: allowanceRounded,
    componentEarning,
    componentDeduction,
    totalSalary: totalSalaryRounded,
  });
}

function isWeeklyOffAbsentLine(line: PayLineInput, config: PayTypeConfig): boolean {
  if (line.status !== 'ABSENT' || isPayrollLeaveLine(line) || isPayrollHolidayLine(line)) return false;
  if (resolveDeductDenominator(config) !== 'WORKING_DAYS') return false;
  return isExcludedWeekdayYmd(line.workDate, resolveExcludedWeekdays(config));
}

function calendarDeductDayPay(
  line: PayLineInput,
  dailyRate: number,
  config: PayTypeConfig,
  month: string,
  compensation: CompensationInput
): number {
  if (isPayrollHolidayLine(line)) {
    return holidayDayPayAmount({
      line,
      month,
      employeeDailyRate: dailyRate,
      compensation,
    });
  }

  if (isPayrollLeaveLine(line)) {
    const paid =
      line.leavePayPercent != null
        ? line.leavePayPercent > 0
        : isPaidLeaveType(line.leaveType as 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY');
    if (!paid) return 0;
    const pct = line.leavePayPercent ?? 100;
    return roundMoney(dailyRate * (pct / 100));
  }

  if (line.status === 'ABSENT') {
    if (isWeeklyOffAbsentLine(line, config)) return 0;
    return 0;
  }

  return roundMoney(dailyRate);
}

function buildCalendarDeductDayRow(
  line: PayLineInput,
  dailyRate: number,
  config: PayTypeConfig,
  month: string,
  compensation: CompensationInput,
  splitMap: Map<string, AttendanceComponentSplit>,
  packageLines: PayLineInput[]
): PayDayBreakdown {
  const dayPay = calendarDeductDayPay(line, dailyRate, config, month, compensation);

  if (isPayrollHolidayLine(line)) {
    const lineBasic = lineBasicHours(line);
    const basicHourRate = lineBasic ? dailyRate / lineBasic : 0;
    return buildPaidHolidayDayRow({
      line,
      month,
      employeeDailyRate: dailyRate,
      basicHourRate,
      compensation,
      employeeConfig: config,
      splitMap,
      packageLines,
    });
  }

  if (shouldPayExcludedWeekdayWorkAtOtOnly(line, config)) {
    const lineBasic = lineBasicHours(line);
    const basicHourRate = lineBasic ? dailyRate / lineBasic : 0;
    return buildExcludedWeekdayWorkDayRow(line, basicHourRate, resolveOtPercent(config), config);
  }

  if (
    isExcludedWeekdayLine(line, config) &&
    !isPayrollHolidayLine(line) &&
    !isPayrollLeaveLine(line)
  ) {
    return buildExcludedWeekdayInfoDayRow(line, config);
  }

  if (isPayrollLeaveLine(line)) {
    const paid =
      line.leavePayPercent != null
        ? line.leavePayPercent > 0
        : isPaidLeaveType(line.leaveType as 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY');
    const label = line.leaveTypeLabel
      ? `Leave (${line.leaveTypeLabel})`
      : line.leaveType
        ? `Leave (${line.leaveType.replace(/_/g, ' ')})`
        : 'Leave';
    if (!paid) {
      return finishPayDayBreakdown({
        date: line.workDate,
        status: label,
        basicHours: 0,
        otHours: 0,
        basicHourRate: 0,
        basicHourSalary: 0,
        otHourRate: 0,
        otHourSalary: 0,
        allowance: 0,
        totalSalary: 0,
        detail: 'Unpaid leave',
      });
    }
    const pct = line.leavePayPercent ?? 100;
    return finishPayDayBreakdown({
      date: line.workDate,
      status: label,
      basicHours: 0,
      otHours: 0,
      basicHourRate: dailyRate,
      basicHourSalary: dayPay,
      otHourRate: 0,
      otHourSalary: 0,
      allowance: 0,
      totalSalary: dayPay,
      detail: pct < 100 ? `${pct}% paid leave` : 'Paid leave',
    });
  }

  if (line.status === 'ABSENT') {
    return finishPayDayBreakdown({
      date: line.workDate,
      status: formatPayDayStatus(line, config),
      basicHours: 0,
      otHours: 0,
      basicHourRate: 0,
      basicHourSalary: 0,
      otHourRate: 0,
      otHourSalary: 0,
      allowance: 0,
      totalSalary: 0,
      detail: 'Unpaid absence',
    });
  }

  const { totalHours, basicHours, otHours, lineBasic } = resolveDayHoursForBreakdown(line);
  const basicHourRate = lineBasic > 0 ? roundMoney(dailyRate / lineBasic) : 0;
  const { earning: componentEarning, deduction: componentDeduction } = resolvePerDayComponentSplit({
    line,
    compensation,
    month,
    excludedWeekdays: resolveExcludedWeekdays(config),
    lines: packageLines,
    config,
    splitMap,
  });
  const allowance = roundMoney(componentEarning - componentDeduction);
  const totalSalary = roundMoney(dayPay + allowance);

  return finishPayDayBreakdown({
    date: line.workDate,
    status: formatPayDayStatus(line, config),
    totalHours,
    basicHours,
    otHours,
    basicHourRate,
    basicHourSalary: dayPay,
    otHourRate: 0,
    otHourSalary: 0,
    allowance,
    componentEarning,
    componentDeduction,
    totalSalary,
    detail: 'Present',
  });
}

export function calculatePayLine(params: {
  month: string;
  config: PayTypeConfig;
  compensation: CompensationInput;
  lines: PayLineInput[];
  resolveLineContext?: (line: PayLineInput) => LinePayContext;
}): PayLineResult {
  const { month, config, compensation, lines, resolveLineContext } = params;
  const breakdown: Record<string, number> = {};
  const dayRows: PayDayBreakdown[] = [];
  const defaultCtx: LinePayContext = { compensation, config };
  const lineCtx = (line: PayLineInput): LinePayContext =>
    resolveLineContext?.(line) ?? defaultCtx;
  const usesPerLineContext = Boolean(resolveLineContext);

  if (config.mode === 'MONTHLY_FIXED') {
    let gross = roundMoney(compensation.monthlyBasic);
    breakdown.monthlyBasic = gross;
    let holidayWorkedOtTotal = 0;
    let excludedWeekdayOtTotal = 0;
    const dayRowsFixed = lines.map((line) => {
      const ctx = lineCtx(line);
      const denom = resolveCalendarDeductDayCount(month, ctx.config);
      const dailyRate = denom > 0 ? ctx.compensation.monthlyBasic / denom : 0;
      if (shouldPayExcludedWeekdayWorkAtOtOnly(line, ctx.config)) {
        const lineBasic = lineBasicHours(line);
        const basicHourRate = lineBasic && dailyRate > 0 ? dailyRate / lineBasic : 0;
        const row = buildExcludedWeekdayWorkDayRow(
          line,
          basicHourRate,
          resolveOtPercent(ctx.config),
          ctx.config
        );
        excludedWeekdayOtTotal += row.totalSalary;
        return row;
      }
      if (!shouldPayHolidayWorkedOt(line)) return emptyPayDayBreakdown(line);
      const lineBasic = lineBasicHours(line);
      const basicHourRate = lineBasic && dailyRate > 0 ? dailyRate / lineBasic : 0;
      const { otPay, otHourRate } = holidayWorkedOtPay(line, basicHourRate, ctx.config);
      holidayWorkedOtTotal += otPay;
      const otHours = workedHoursFromMinutes(line.workedMinutes);
      return finishPayDayBreakdown({
        date: line.workDate,
        status: formatPayDayStatus(line),
        totalHours: otHours,
        basicHours: 0,
        otHours,
        basicHourRate: 0,
        basicHourSalary: 0,
        otHourRate,
        otHourSalary: otPay,
        allowance: 0,
        totalSalary: otPay,
        detail: otPay > 0 ? `Holiday work OT` : undefined,
      });
    });
    if (holidayWorkedOtTotal > 0) {
      breakdown.holidayWorkedOt = roundMoney(holidayWorkedOtTotal);
      gross = roundMoney(gross + holidayWorkedOtTotal);
    }
    if (excludedWeekdayOtTotal > 0) {
      breakdown.excludedWeekdayOt = roundMoney(excludedWeekdayOtTotal);
      gross = roundMoney(gross + excludedWeekdayOtTotal);
    }
    gross = usesPerLineContext
      ? applyFixedSalaryComponentsPerPackage({ gross, lines, breakdown, lineCtx })
      : applySalaryComponentsToGross({
          gross,
          compensation,
          lines,
          breakdown,
          month,
          excludedWeekdays: resolveExcludedWeekdays(config),
          config,
        });
    return {
      gross,
      breakdown,
      days: sortPayDayBreakdowns(dayRowsFixed),
    };
  }

  if (config.mode === 'MONTHLY_CALENDAR_DEDUCT') {
    type PackageAccrual = {
      accrualGross: number;
      outsideCapGross: number;
      monthlyBasic: number;
    };
    const accruals = new Map<string, PackageAccrual>();
    let earnedDays = 0;
    let unpaidAbsentDays = 0;
    let deductDaysInMonth = resolveCalendarDeductDayCount(month, config);
    const linesByPackage = groupLinesByPackage(lines, lineCtx);
    const attendanceSplitCache = new Map<string, Map<string, AttendanceComponentSplit>>();

    for (const line of lines) {
      const ctx = lineCtx(line);
      deductDaysInMonth = resolveCalendarDeductDayCount(month, ctx.config);
      const dailyRate = ctx.compensation.monthlyBasic / deductDaysInMonth;
      const packageKey = ctx.packageId ?? 'default';
      const packageLines = linesByPackage.get(packageKey) ?? [line];
      const splitMap = getAttendanceSplitMap(
        attendanceSplitCache,
        packageKey,
        ctx,
        packageLines,
        month
      );
      const row = buildCalendarDeductDayRow(
        line,
        dailyRate,
        ctx.config,
        month,
        ctx.compensation,
        splitMap,
        packageLines
      );
      dayRows.push(row);
      const key = ctx.packageId ?? 'default';
      const bucket = accruals.get(key) ?? {
        accrualGross: 0,
        outsideCapGross: 0,
        monthlyBasic: ctx.compensation.monthlyBasic,
      };
      if (shouldPayHolidayWorkedOt(line)) {
        bucket.outsideCapGross += row.otHourSalary;
        bucket.accrualGross += row.basicHourSalary + row.otHourSalary;
      } else if (shouldPayExcludedWeekdayWorkAtOtOnly(line, ctx.config)) {
        bucket.outsideCapGross += row.totalSalary;
        bucket.accrualGross += row.totalSalary;
      } else {
        bucket.accrualGross += row.basicHourSalary + row.otHourSalary;
      }
      accruals.set(key, bucket);
      if (row.totalSalary > 0) earnedDays += 1;
      if (
        line.status === 'ABSENT' &&
        !isPayrollLeaveLine(line) &&
        !isPayrollHolidayLine(line) &&
        !isWeeklyOffAbsentLine(line, ctx.config)
      ) {
        unpaidAbsentDays += 1;
      }
    }

    redistributeCalendarDeductBasicOnRows(lines, dayRows, lineCtx, month);
    syncCalendarDeductAllowanceOnRows(lines, dayRows, lineCtx, month, attendanceSplitCache);

    let outsideCapGross = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const row = dayRows[index];
      const ctx = lineCtx(line);
      if (shouldPayHolidayWorkedOt(line)) {
        outsideCapGross += row.otHourSalary;
      } else if (shouldPayExcludedWeekdayWorkAtOtOnly(line, ctx.config)) {
        outsideCapGross += row.totalSalary;
      }
    }
    let gross = sumMoney(dayRows.map((row) => row.totalSalary));
    breakdown.monthlyBasic = compensation.monthlyBasic;
    if (accruals.size === 1) {
      const only = [...accruals.values()][0];
      breakdown.dailyRate = roundMoney(only.monthlyBasic / deductDaysInMonth);
    } else if (accruals.size > 1) {
      breakdown.compensationPackageCount = accruals.size;
    }
    breakdown.earnedDays = earnedDays;
    breakdown.deductDaysInMonth = deductDaysInMonth;
    breakdown.unpaidAbsentDays = unpaidAbsentDays;
    if (outsideCapGross > 0) breakdown.outsideCapOt = roundMoney(outsideCapGross);
    gross = usesPerLineContext
      ? applyFixedSalaryComponentsPerPackage({ gross, lines, breakdown, lineCtx })
      : applySalaryComponentsToGross({
          gross,
          compensation,
          lines,
          breakdown,
          month,
          excludedWeekdays: resolveExcludedWeekdays(config),
          config,
          attendanceOnDayRows: true,
        });
    return { gross, breakdown, days: sortPayDayBreakdowns(dayRows) };
  }

  if (config.mode === 'DAILY_WAGE') {
    const otPercent = resolveOtPercent(config);
    let gross = 0;
    for (const line of lines) {
      const ctx = lineCtx(line);
      const row = buildDailyWageDayRow(
        line,
        ctx.compensation.dailyRate,
        resolveOtPercent(ctx.config),
        month,
        ctx.compensation,
        ctx.config
      );
      dayRows.push(row);
      gross += row.totalSalary;
    }
    breakdown.dailyWageTotal = roundMoney(gross);
    gross = usesPerLineContext
      ? applyFixedSalaryComponentsPerPackage({ gross, lines, breakdown, lineCtx })
      : applySalaryComponentsToGross({
          gross,
          compensation,
          lines,
          breakdown,
          month,
          excludedWeekdays: resolveExcludedWeekdays(config),
          config,
        });
    return { gross: roundMoney(gross), breakdown, days: sortPayDayBreakdowns(dayRows) };
  }

  if (config.mode === 'CUSTOM') {
    const custom = evaluateCustomFormula({ month, config, compensation, lines });
    custom.gross = usesPerLineContext
      ? applyFixedSalaryComponentsPerPackage({
          gross: custom.gross,
          lines,
          breakdown: custom.breakdown,
          lineCtx,
        })
      : applySalaryComponentsToGross({
          gross: custom.gross,
          compensation,
          lines,
          breakdown: custom.breakdown,
          month,
          excludedWeekdays: resolveExcludedWeekdays(config),
          config,
        });
    custom.days = mergeCustomDayTrace(lines, custom.days);
    return custom;
  }

  if (config.mode === 'HOURLY_SPLIT') {
    let gross = 0;
    const fixedByPackage = new Map<string, number>();
    const linesByPackage = groupLinesByPackage(lines, lineCtx);
    const attendanceSplitCache = new Map<string, Map<string, AttendanceComponentSplit>>();

    for (const line of lines) {
      const ctx = lineCtx(line);
      const excludedWeekdays = resolveExcludedWeekdays(ctx.config);
      const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
      const basic = ctx.compensation.monthlyBasic;
      const comps = ctx.compensation.salaryComponents;
      const packageKey = ctx.packageId ?? 'default';
      const packageLines = linesByPackage.get(packageKey) ?? [line];
      const splitMap = getAttendanceSplitMap(
        attendanceSplitCache,
        packageKey,
        ctx,
        packageLines,
        month
      );

      if (isPayrollHolidayLine(line)) {
        const lineBasic = lineBasicHours(line);
        const employeeDailyRate = denom > 0 ? basic / denom : 0;
        const basicHourRate = lineBasic && employeeDailyRate > 0 ? employeeDailyRate / lineBasic : 0;
        const row = buildPaidHolidayDayRow({
          line,
          month,
          employeeDailyRate,
          basicHourRate,
          compensation: ctx.compensation,
          employeeConfig: ctx.config,
          splitMap,
          packageLines,
        });
        dayRows.push(row);
        gross += row.totalSalary;
        continue;
      }
      if (isPayrollLeaveLine(line)) {
        dayRows.push(emptyPayDayBreakdown(line));
        if (isLeavePaidForPay(line)) continue;
        continue;
      }
      if (line.status === 'ABSENT') {
        dayRows.push(emptyPayDayBreakdown(line));
        continue;
      }

      const row = buildHourlySplitDayRow(line, {
        basic,
        denom,
        compensation: ctx.compensation,
        month,
        excludedWeekdays,
        config: ctx.config,
        splitMap,
        packageLines,
      });
      dayRows.push(row);
      gross += row.totalSalary;

      if (comps) {
        const key = ctx.packageId ?? 'default';
        if (!fixedByPackage.has(key)) {
          const factor = ctx.fixedMonthlyProrationFactor;
          const prorated =
            factor != null && factor < 1 ? prorateSalaryComponentTotals(comps, factor) : comps;
          fixedByPackage.set(key, fixedSalaryComponentNet(prorated));
        }
      }
    }

    redistributeHourlySplitBasicOnRows(lines, dayRows, lineCtx);
    gross = roundMoney(dayRows.reduce((sum, row) => sum + row.totalSalary, 0));

    let fixedNet = 0;
    for (const value of fixedByPackage.values()) {
      fixedNet += value;
    }
    if (fixedNet !== 0) breakdown.salaryComponentsFixed = roundMoney(fixedNet);
    gross = roundMoney(gross + fixedNet);

    breakdown.hourlyTotal = roundMoney(gross);
    return { gross: roundMoney(gross), breakdown, days: sortPayDayBreakdowns(dayRows) };
  }

  return { gross: 0, breakdown, days: sortPayDayBreakdowns(lines.map((line) => emptyPayDayBreakdown(line))) };
}

export function attendanceLinesForPayroll(
  rows: Array<{
    workDate: Date;
    status: string;
    leaveType?: string | null;
    leaveTypeId?: string | null;
    leaveRequestId?: string | null;
    leaveTypeRef?: { name?: string; code?: string } | null;
    leavePayPercent?: number;
    basicHours: number | Prisma.Decimal | { toString(): string };
    workedMinutes?: number;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    breakStartAt: Date | null;
    breakEndAt: Date | null;
    overtimeMinutes?: number;
  }>,
  month: string
): PayLineInput[] {
  const monthStart = `${month}-01`;
  const monthEndDay = daysInMonth(month);
  const monthEnd = `${month}-${String(monthEndDay).padStart(2, '0')}`;

  return rows
    .filter((r) => {
      const ymd = r.workDate.toISOString().slice(0, 10);
      return ymd >= monthStart && ymd <= monthEnd;
    })
    .map((r) => {
      const ymd = r.workDate.toISOString().slice(0, 10);
      const workedMinutes = resolveWorkedMinutesFromAttendance(r);
      return {
        workDate: ymd,
        status: r.status,
        leaveType: r.leaveType ?? null,
        leaveTypeLabel: r.leaveTypeRef?.name ?? null,
        leaveTypeId: r.leaveTypeId ?? null,
        leaveTypeCode: r.leaveTypeRef?.code ?? null,
        leaveRequestId: r.leaveRequestId ?? null,
        leavePayPercent: r.leavePayPercent,
        basicHours: Number(r.basicHours),
        workedMinutes,
        isSunday: isSundayYmd(ymd),
      };
    });
}
