import { Prisma, type PrismaClient } from '@prisma/client';

import {
  nextEmployeeCodeFromExisting,
  planEmployeeCodeRenumber,
  readEmployeeCodeSettingsFromCompanyData,
  temporaryEmployeeCode,
  type EmployeeCodeRenumberRow,
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

/** Serializes code allocation with a renumber of the same company. Call inside a transaction. */
export async function lockEmployeeCodeAllocation(
  tx: { $queryRaw: PrismaClient['$queryRaw'] },
  companyId: string
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Company" WHERE id = ${companyId} FOR UPDATE`);
}

const renumberSelect = {
  id: true,
  employeeCode: true,
  fullName: true,
  hireDate: true,
  createdAt: true,
} as const;

/** Reads the company's employees and returns the new codes. Does not write. */
export async function previewEmployeeCodeRenumber(
  db: DbClient,
  companyId: string,
  referenceDate = new Date()
): Promise<EmployeeCodeRenumberRow[]> {
  const settings = await loadEmployeeCodeSettings(db, companyId);
  const employees = await db.employee.findMany({
    where: { companyId },
    select: renumberSelect,
  });
  return planEmployeeCodeRenumber(employees, settings, referenceDate);
}

/**
 * Rewrites one company's employee codes to the saved series.
 * Locks that company's employee rows, parks every code on a temporary value,
 * then writes the final codes and the pay-run copies.
 */
export async function applyEmployeeCodeRenumber(
  db: PrismaClient,
  companyId: string,
  referenceDate = new Date()
): Promise<EmployeeCodeRenumberRow[]> {
  return db.$transaction(
    async (tx) => {
      await lockEmployeeCodeAllocation(tx, companyId);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Employee" WHERE "companyId" = ${companyId} FOR UPDATE`
      );
      const settings = await loadEmployeeCodeSettings(tx, companyId);
      const employees = await tx.employee.findMany({
        where: { companyId },
        select: renumberSelect,
      });
      const plan = planEmployeeCodeRenumber(employees, settings, referenceDate);

      for (const row of plan) {
        await tx.employee.update({
          where: { id: row.id },
          data: { employeeCode: temporaryEmployeeCode(row.id) },
        });
      }
      for (const row of plan) {
        await tx.employee.update({
          where: { id: row.id },
          data: { employeeCode: row.newCode },
        });
        await tx.payRunLine.updateMany({
          where: { companyId, employeeId: row.id },
          data: { employeeCode: row.newCode },
        });
      }
      return plan;
    },
    { timeout: 120_000 }
  );
}
