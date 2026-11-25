import { evaluateCustomFormula } from '@/lib/hr/payroll/evaluateCustomFormula';
import {
  evaluateExpression,
  evaluateFormulaScript,
  parseFormulaScript,
} from '@/lib/hr/payroll/formulaEngine';
import { formulaScriptForMode } from '@/lib/hr/payroll/formulaModeScripts';
import { previewPayConfig } from '@/lib/hr/payroll/previewPayConfig';

describe('formulaEngine', () => {
  it('parses and evaluates monthly deduct script', () => {
    const script = formulaScriptForMode('MONTHLY_CALENDAR_DEDUCT');
    const assignments = parseFormulaScript(script);
    expect(assignments.some((a) => a.target === 'gross')).toBe(true);

    const result = evaluateFormulaScript(
      script,
      { monthly_basic: 3000, days_in_month: 30, absent_days: 1 },
      () => []
    );
    expect(result.gross).toBe(2900);
  });

  it('supports comparisons in if()', () => {
    const v = evaluateExpression('if(worked_hours >= basic_hours, 100, 50)', {
      worked_hours: 10,
      basic_hours: 9,
    });
    expect(v).toBe(100);
  });

  it('evaluates daily wage custom script like built-in', () => {
    const script = formulaScriptForMode('DAILY_WAGE');
    const result = evaluateCustomFormula({
      month: '2026-06',
      config: { mode: 'CUSTOM', formulaScript: script, otDivisor: 10, defaultBasicHours: 9 },
      compensation: { monthlyBasic: 0, monthlyAllowance: 0, dailyRate: 120 },
      lines: [
        {
          workDate: '2026-06-01',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 9 * 60,
          isSunday: false,
        },
        {
          workDate: '2026-06-02',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 10 * 60,
          isSunday: false,
        },
      ],
    });
    expect(result.gross).toBe(252);
  });

  it('treats only annual leave as unpaid in custom formulas', () => {
    const lines = [
      {
        workDate: '2026-06-01',
        status: 'PRESENT',
        leaveType: null,
        basicHours: 8,
        workedMinutes: 480,
        isSunday: false,
      },
      {
        workDate: '2026-06-02',
        status: 'LEAVE',
        leaveType: 'ANNUAL' as const,
        leaveTypeCode: 'ANNUAL',
        leaveRequestId: 'annual',
        basicHours: 8,
        workedMinutes: 0,
        isSunday: false,
      },
      {
        workDate: '2026-06-03',
        status: 'LEAVE',
        leaveType: 'SICK' as const,
        leaveTypeCode: 'SICK',
        leaveRequestId: 'sick',
        leavePayPercent: 50,
        basicHours: 8,
        workedMinutes: 0,
        isSunday: false,
      },
    ];
    const compensation = { monthlyBasic: 3000, monthlyAllowance: 500, dailyRate: 0 };
    const paid = evaluateCustomFormula({
      month: '2026-06',
      config: {
        mode: 'CUSTOM',
        formulaScript: 'gross = sum_days(if(is_paid_leave > 0, 100, if(is_present > 0, 40, 0)))',
      },
      compensation,
      lines,
    });
    expect(paid.gross).toBe(140);
    expect(paid.days.find((day) => day.date === '2026-06-02')?.totalSalary).toBe(0);
    expect(paid.days.find((day) => day.date === '2026-06-03')?.totalSalary).toBe(100);

    const counted = evaluateCustomFormula({
      month: '2026-06',
      config: { mode: 'CUSTOM', formulaScript: 'gross = paid_leave_days' },
      compensation,
      lines,
    });
    expect(counted.gross).toBe(1);
  });

  it('previewPayConfig reports formula errors', () => {
    const preview = previewPayConfig({
      month: '2026-06',
      config: { mode: 'CUSTOM', formulaScript: 'gross = monthly_basic / 0' },
      compensation: { monthlyBasic: 1000, monthlyAllowance: 0, dailyRate: 0 },
      lines: [],
    });
    expect(preview.formulaError).toContain('zero');
  });
});
