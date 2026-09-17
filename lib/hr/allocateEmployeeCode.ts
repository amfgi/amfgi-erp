import type { PrismaClient } from '@prisma/client';

import {
  nextEmployeeCodeFromExisting,
  readEmployeeCodeSettingsFromCompanyData,
  type EmployeeCodeSettings,
} from '@/lib/hr/employeeCodeSettings';

type DbClient = Pick<PrismaClient, 'company' | 'employee'>;

export async function loadEmployeeCodeSettings(
  db: DbClient,
  companyId: string
): Promise<EmployeeCodeSettings> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { hrEmployeeCodeSettings: true },
  });
  return readEmployeeCodeSettingsFromCompanyData(company);
}

/**
 * Allocates the next employee code for a company from live codes + company settings.
 * Caller should retry on unique constraint races.
 */
export async function allocateNextEmployeeCode(
  db: DbClient,
  companyId: string,
  referenceDate = new Date()
): Promise<{ code: string; settings: EmployeeCodeSettings }> {
  const settings = await loadEmployeeCodeSettings(db, companyId);
  const prefix = settings.prefix;
  const rows = await db.employee.findMany({
    where: {
      companyId,
      employeeCode: { startsWith: prefix, mode: 'insensitive' },
    },
    select: { employeeCode: true },
  });
  const code = nextEmployeeCodeFromExisting(
    rows.map((row) => row.employeeCode),
    settings,
    referenceDate
  );
  return { code, settings };
}
