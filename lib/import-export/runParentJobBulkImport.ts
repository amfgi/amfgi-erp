import type { PrismaClient } from '@prisma/client';
import { syncJobContacts } from '@/lib/jobs/jobContacts';
import { normalizeRequiredExpertiseNames, syncJobRequiredExpertises } from '@/lib/jobs/jobRequiredExpertises';
import type { ParentJobImportRow } from '@/lib/import-export/parentJobFields';
import type { BulkImportResult } from '@/lib/import-export/types';
import { decimalToNumber } from '@/lib/utils/decimal';

type ExistingParentJob = {
  id: string;
  jobNumber: string;
  source: string;
};

function parseDateOrNull(value?: string) {
  if (!value?.trim()) return null;
  return new Date(`${value.trim()}T00:00:00Z`);
}

export async function runParentJobBulkImport(
  prisma: PrismaClient,
  opts: {
    companyId: string;
    userId: string;
    jobSourceMode: 'HYBRID' | 'EXTERNAL_ONLY' | 'INTERNAL_ONLY';
    newRows: ParentJobImportRow[];
    updateRows: ParentJobImportRow[];
  }
): Promise<BulkImportResult> {
  const { companyId, userId, jobSourceMode, newRows, updateRows } = opts;
  const warnings: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const customers = await prisma.customer.findMany({
    where: { companyId },
    select: { id: true, name: true },
  });
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const customerByName = new Map(customers.map((c) => [c.name.trim().toLowerCase(), c]));

  const existing = await prisma.job.findMany({
    where: { companyId, parentJobId: null },
    select: { id: true, jobNumber: true, source: true },
  });
  const byId = new Map(existing.map((j) => [j.id, j]));
  const byJobNumber = new Map(existing.map((j) => [j.jobNumber.trim().toLowerCase(), j]));

  const resolveCustomerId = (row: ParentJobImportRow): string | null => {
    if (row.customerId && customerById.has(row.customerId)) return row.customerId;
    if (row.customerName) {
      const match = customerByName.get(row.customerName.trim().toLowerCase());
      return match?.id ?? null;
    }
    return null;
  };

  const resolveExisting = (row: ParentJobImportRow): ExistingParentJob | null => {
    if (row.id && byId.has(row.id)) return byId.get(row.id)!;
    const byNum = byJobNumber.get(row.jobNumber.trim().toLowerCase());
    return byNum ?? null;
  };

  const buildJobData = (row: ParentJobImportRow, customerId: string) => ({
    jobNumber: row.jobNumber.trim(),
    customerId,
    description: row.description?.trim() || null,
    site: row.site?.trim() || null,
    address: row.address?.trim() || null,
    status: row.status ?? 'ACTIVE',
    startDate: parseDateOrNull(row.startDate) ?? new Date(),
    endDate: parseDateOrNull(row.endDate),
    quotationNumber: row.quotationNumber?.trim() || null,
    quotationDate: parseDateOrNull(row.quotationDate),
    lpoNumber: row.lpoNumber?.trim() || null,
    lpoDate: parseDateOrNull(row.lpoDate),
    lpoValue: decimalToNumber(row.lpoValue) ?? null,
    projectName: row.projectName?.trim() || null,
    projectDetails: row.projectDetails?.trim() || null,
    contactPerson: row.contactPerson?.trim() || null,
    salesPerson: row.salesPerson?.trim() || null,
    jobWorkValue: decimalToNumber(row.jobWorkValue) ?? null,
    parentJobId: null as string | null,
  });

  const applyRow = async (row: ParentJobImportRow, mode: 'create' | 'update', match: ExistingParentJob | null) => {
    if (mode === 'update' && match?.source === 'EXTERNAL_API') {
      skipped += 1;
      warnings.push(`Skipped synced parent job "${match.jobNumber}" (external API).`);
      return;
    }
    if (mode === 'create' && jobSourceMode === 'EXTERNAL_ONLY') {
      skipped += 1;
      warnings.push(`Skipped create for "${row.jobNumber}" (company is external-only parent jobs).`);
      return;
    }

    const customerId = resolveCustomerId(row);
    if (!customerId) {
      skipped += 1;
      warnings.push(`Customer not found for job "${row.jobNumber}".`);
      return;
    }

    const requiredExpertises = normalizeRequiredExpertiseNames(row.requiredExpertises);
    const jobData = buildJobData(row, customerId);

    if (mode === 'create') {
      const dup = byJobNumber.get(row.jobNumber.trim().toLowerCase());
      if (dup) {
        skipped += 1;
        warnings.push(`Job number already exists: ${row.jobNumber}`);
        return;
      }

      const job = await prisma.$transaction(async (tx) => {
        const created = await tx.job.create({
          data: {
            ...jobData,
            companyId,
            createdBy: userId,
            source: 'LOCAL',
            externalJobId: null,
            finishedGoods: [],
          },
        });
        await syncJobContacts(tx, {
          companyId,
          jobId: created.id,
          contacts: row.contactsJson,
        });
        await syncJobRequiredExpertises(tx, {
          companyId,
          jobId: created.id,
          names: requiredExpertises,
        });
        return created;
      });
      byId.set(job.id, { id: job.id, jobNumber: job.jobNumber, source: 'LOCAL' });
      byJobNumber.set(job.jobNumber.trim().toLowerCase(), {
        id: job.id,
        jobNumber: job.jobNumber,
        source: 'LOCAL',
      });
      created += 1;
      return;
    }

    if (!match) {
      skipped += 1;
      warnings.push(`Update target not found: ${row.jobNumber}`);
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: match.id },
        data: jobData,
      });
      if (row.contactsJson !== undefined) {
        await syncJobContacts(tx, {
          companyId,
          jobId: match.id,
          contacts: row.contactsJson,
        });
      }
      if (row.requiredExpertises !== undefined) {
        await syncJobRequiredExpertises(tx, {
          companyId,
          jobId: match.id,
          names: requiredExpertises,
        });
      }
    });
    updated += 1;
  };

  for (const row of newRows) {
    await applyRow(row, 'create', null);
  }
  for (const row of updateRows) {
    await applyRow(row, 'update', resolveExisting(row));
  }

  return { created, updated, skipped, warnings };
}
