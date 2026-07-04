import type { PrismaClient } from '@prisma/client';

import {
  formatPackageForApi,
  packageInclude,
  type CompensationPackageRow,
} from '@/lib/hr/payroll/compensationPackageFormat';
import type { PayCalculationMode } from '@/lib/hr/payroll/types';
import type { EmployeeCompensationExportSnapshot } from '@/lib/import-export/employeeCompensationFields';

function payTypeModeFromConfig(config: unknown): PayCalculationMode | null {
  if (!config || typeof config !== 'object') return null;
  const mode = (config as { mode?: unknown }).mode;
  if (
    mode === 'MONTHLY_FIXED' ||
    mode === 'MONTHLY_CALENDAR_DEDUCT' ||
    mode === 'DAILY_WAGE' ||
    mode === 'HOURLY_SPLIT' ||
    mode === 'CUSTOM'
  ) {
    return mode;
  }
  return null;
}

function pickCurrentCompensationPackage(
  packages: CompensationPackageRow[]
): CompensationPackageRow | null {
  if (packages.length === 0) return null;
  const open = packages.find((p) => !p.effectiveTo);
  if (open) return open;
  return [...packages].sort(
    (a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime()
  )[0];
}

export async function batchCurrentCompensationForEmployees(
  db: Pick<PrismaClient, 'employeeCompensation'>,
  companyId: string,
  employeeIds: string[]
): Promise<Map<string, EmployeeCompensationExportSnapshot>> {
  const map = new Map<string, EmployeeCompensationExportSnapshot>();
  if (employeeIds.length === 0) return map;

  const rows = await db.employeeCompensation.findMany({
    where: { companyId, employeeId: { in: employeeIds } },
    include: packageInclude,
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  });

  const byEmployee = new Map<string, CompensationPackageRow[]>();
  for (const row of rows) {
    const list = byEmployee.get(row.employeeId) ?? [];
    list.push(row);
    byEmployee.set(row.employeeId, list);
  }

  for (const [employeeId, packages] of byEmployee) {
    const current = pickCurrentCompensationPackage(packages);
    if (!current) continue;
    const formatted = formatPackageForApi(current);
    map.set(employeeId, {
      payTypeName: current.payType.name,
      payTypeCode: current.payType.code,
      payTypeMode: payTypeModeFromConfig(current.payType.config),
      monthlyBasic: formatted.monthlyBasic,
      dailyRate: formatted.dailyRate,
      components: current.allowances.map((a) => ({
        name: a.allowanceType.name,
        amount: Number(a.amount),
        componentKind: a.allowanceType.componentKind,
      })),
      totalMonthly: formatted.totalMonthly,
      effectiveFrom: formatted.effectiveFrom,
    });
  }

  return map;
}
