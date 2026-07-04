import type { PayCalculationMode } from '@/lib/hr/payroll/types';

export type EmployeeCompensationExportSnapshot = {
  payTypeName: string;
  payTypeCode: string;
  payTypeMode: PayCalculationMode | null;
  monthlyBasic: number | null;
  dailyRate: number | null;
  components: Array<{ name: string; amount: number; componentKind: string }>;
  totalMonthly: number | null;
  effectiveFrom: string | null;
};

function formatCompensationMoney(value: number | null | undefined) {
  if (value == null) return '—';
  return `${value.toLocaleString()} AED`;
}

export function usesDailyCompensationRate(mode: PayCalculationMode | null | undefined) {
  return mode === 'DAILY_WAGE';
}

export function formatDirectoryCompensationAmount(
  compensation: Pick<EmployeeCompensationExportSnapshot, 'payTypeMode' | 'dailyRate' | 'totalMonthly'> | null | undefined
) {
  if (!compensation) return 'Not set';
  if (usesDailyCompensationRate(compensation.payTypeMode)) {
    if (compensation.dailyRate == null) return '—';
    return `${formatCompensationMoney(compensation.dailyRate)}/day`;
  }
  if (compensation.totalMonthly == null) return '—';
  return `${formatCompensationMoney(compensation.totalMonthly)}/mo`;
}

export function compensationFieldsToExportColumns(
  snapshot?: EmployeeCompensationExportSnapshot | null
): Record<string, string | number> {
  if (!snapshot) {
    return {
      'Compensation Type': '',
      'Compensation Basic': '',
      'Compensation Per Day': '',
      'Compensation Components': '',
      'Compensation Total': '',
      'Compensation Effective From': '',
    };
  }
  return {
    'Compensation Type': snapshot.payTypeName,
    'Compensation Basic': snapshot.monthlyBasic ?? '',
    'Compensation Per Day': snapshot.dailyRate ?? '',
    'Compensation Components': snapshot.components
      .map((c) => {
        const signed = c.componentKind === 'DEDUCTION' ? -c.amount : c.amount;
        return `${c.name}=${signed}`;
      })
      .join('; '),
    'Compensation Total': snapshot.totalMonthly ?? '',
    'Compensation Effective From': snapshot.effectiveFrom ?? '',
  };
}
