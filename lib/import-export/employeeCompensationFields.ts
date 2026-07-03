export type EmployeeCompensationExportSnapshot = {
  payTypeName: string;
  payTypeCode: string;
  monthlyBasic: number | null;
  dailyRate: number | null;
  components: Array<{ name: string; amount: number; componentKind: string }>;
  totalMonthly: number | null;
  effectiveFrom: string | null;
};

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
