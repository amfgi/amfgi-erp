import type { Prisma, PrismaClient } from '@prisma/client';
import {
  buildEmployeeProfileExtensionFromImport,
  type EmployeeImportRow,
} from '@/lib/import-export/employeeFields';
import type { BulkImportResult } from '@/lib/import-export/types';

type ExistingEmployee = {
  id: string;
  employeeCode: string;
};

function parseDateOrNull(value?: string | null) {
  if (!value?.trim()) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function employeeCreateData(companyId: string, row: EmployeeImportRow): Prisma.EmployeeCreateInput {
  const emailNorm = row.email?.trim() ? row.email.trim().toLowerCase() : null;
  return {
    company: { connect: { id: companyId } },
    employeeCode: row.employeeCode.trim(),
    fullName: row.fullName.trim(),
    preferredName: row.preferredName?.trim() || null,
    email: emailNorm,
    phone: row.phone?.trim() || null,
    nationality: row.nationality?.trim() || null,
    dateOfBirth: parseDateOrNull(row.dateOfBirth),
    gender: row.gender?.trim() || null,
    designation: row.designation?.trim() || null,
    department: row.department?.trim() || null,
    employmentType: row.employmentType?.trim() || null,
    hireDate: parseDateOrNull(row.hireDate),
    terminationDate: parseDateOrNull(row.terminationDate),
    status: row.status ?? 'ACTIVE',
    emergencyContactName: row.emergencyContactName?.trim() || null,
    emergencyContactPhone: row.emergencyContactPhone?.trim() || null,
    bloodGroup: row.bloodGroup?.trim() || null,
    portalEnabled: row.portalEnabled ?? false,
    profileExtension: buildEmployeeProfileExtensionFromImport(row) as Prisma.InputJsonValue,
  };
}

function employeeUpdateData(row: EmployeeImportRow): Prisma.EmployeeUpdateInput {
  const emailNorm =
    row.email === undefined
      ? undefined
      : row.email?.trim()
        ? row.email.trim().toLowerCase()
        : null;
  const data: Prisma.EmployeeUpdateInput = {
    employeeCode: row.employeeCode.trim(),
    fullName: row.fullName.trim(),
    preferredName: row.preferredName?.trim() || null,
    phone: row.phone?.trim() || null,
    nationality: row.nationality?.trim() || null,
    dateOfBirth: parseDateOrNull(row.dateOfBirth),
    gender: row.gender?.trim() || null,
    designation: row.designation?.trim() || null,
    department: row.department?.trim() || null,
    employmentType: row.employmentType?.trim() || null,
    hireDate: parseDateOrNull(row.hireDate),
    terminationDate: parseDateOrNull(row.terminationDate),
    status: row.status,
    emergencyContactName: row.emergencyContactName?.trim() || null,
    emergencyContactPhone: row.emergencyContactPhone?.trim() || null,
    bloodGroup: row.bloodGroup?.trim() || null,
    profileExtension: buildEmployeeProfileExtensionFromImport(row) as Prisma.InputJsonValue,
  };
  if (emailNorm !== undefined) data.email = emailNorm;
  if (row.portalEnabled !== undefined) data.portalEnabled = row.portalEnabled;
  return data;
}

export async function runEmployeeBulkImport(
  prisma: PrismaClient,
  opts: {
    companyId: string;
    newRows: EmployeeImportRow[];
    updateRows: EmployeeImportRow[];
  }
): Promise<BulkImportResult> {
  const { companyId, newRows, updateRows } = opts;
  const warnings: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const existing = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, employeeCode: true },
  });
  const byId = new Map(existing.map((e) => [e.id, e]));
  const byCode = new Map(existing.map((e) => [e.employeeCode.trim().toLowerCase(), e]));

  const resolveExisting = (row: EmployeeImportRow): ExistingEmployee | null => {
    if (row.id && byId.has(row.id)) return byId.get(row.id)!;
    const byCd = byCode.get(row.employeeCode.trim().toLowerCase());
    return byCd ?? null;
  };

  const applyRow = async (row: EmployeeImportRow, mode: 'create' | 'update', match: ExistingEmployee | null) => {
    if (mode === 'create') {
      const dup = byCode.get(row.employeeCode.trim().toLowerCase());
      if (dup) {
        skipped += 1;
        warnings.push(`Employee code already exists: ${row.employeeCode}`);
        return;
      }

      try {
        const emp = await prisma.employee.create({
          data: employeeCreateData(companyId, row),
        });
        byId.set(emp.id, { id: emp.id, employeeCode: emp.employeeCode });
        byCode.set(emp.employeeCode.trim().toLowerCase(), { id: emp.id, employeeCode: emp.employeeCode });
        created += 1;
      } catch (e) {
        if (e instanceof Error && e.message.includes('Unique constraint')) {
          skipped += 1;
          warnings.push(`Could not create "${row.employeeCode}" — duplicate code or email`);
          return;
        }
        throw e;
      }
      return;
    }

    if (!match) {
      skipped += 1;
      warnings.push(`Update target not found: ${row.employeeCode}`);
      return;
    }

    try {
      const emp = await prisma.employee.update({
        where: { id: match.id },
        data: employeeUpdateData(row),
      });
      byCode.delete(match.employeeCode.trim().toLowerCase());
      byCode.set(emp.employeeCode.trim().toLowerCase(), { id: emp.id, employeeCode: emp.employeeCode });
      updated += 1;
    } catch (e) {
      if (e instanceof Error && e.message.includes('Unique constraint')) {
        skipped += 1;
        warnings.push(`Could not update "${row.employeeCode}" — duplicate code or email`);
        return;
      }
      throw e;
    }
  };

  for (const row of newRows) {
    await applyRow(row, 'create', null);
  }
  for (const row of updateRows) {
    await applyRow(row, 'update', resolveExisting(row));
  }

  return { created, updated, skipped, warnings };
}
