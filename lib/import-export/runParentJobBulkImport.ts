import type { PrismaClient } from '@prisma/client';
import { syncJobContacts } from '@/lib/jobs/jobContacts';
import { normalizeRequiredExpertiseNames, syncJobRequiredExpertises } from '@/lib/jobs/jobRequiredExpertises';
import {
  buildParentJobCreateData,
  buildParentJobUpdatePatch,
} from '@/lib/import-export/jobImportPatch';
import type { ParentJobImportRow } from '@/lib/import-export/parentJobFields';
import type { BulkImportResult } from '@/lib/import-export/types';

type ExistingParentJob = {
  id: string;
  jobNumber: string;
  source: string;
  customerId: string;
};

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
    select: { id: true, jobNumber: true, source: true, customerId: true },
  });
  const byId = new Map(existing.map((j) => [j.id, j]));
  const byJobNumber = new Map(existing.map((j) => [j.jobNumber.trim().toLowerCase(), j]));

  const resolveCustomerId = (row: ParentJobImportRow, fallbackCustomerId?: string): string | null => {
    if (row.customerId && customerById.has(row.customerId)) return row.customerId;
    if (row.customerName) {
      const match = customerByName.get(row.customerName.trim().toLowerCase());
      return match?.id ?? null;
    }
    return fallbackCustomerId ?? null;
  };

  const resolveExisting = (row: ParentJobImportRow): ExistingParentJob | null => {
    if (row.id && byId.has(row.id)) return byId.get(row.id)!;
    const byNum = byJobNumber.get(row.jobNumber.trim().toLowerCase());
    return byNum ?? null;
  };

  const looksLikeVariationJobNumber = (jobNumber: string): boolean => {
    const normalized = jobNumber.trim().toLowerCase();
    for (const parent of existing) {
      const parentKey = parent.jobNumber.trim().toLowerCase();
      if (normalized.startsWith(`${parentKey}-`) && normalized.length > parentKey.length + 1) {
        return true;
      }
    }
    return false;
  };

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
    if (mode === 'create' && looksLikeVariationJobNumber(row.jobNumber)) {
      skipped += 1;
      warnings.push(
        `"${row.jobNumber}" looks like a job variation. Use Import job variations (not Import parent jobs).`,
      );
      return;
    }

    const customerId = resolveCustomerId(row, mode === 'update' ? match?.customerId : undefined);
    if (!customerId) {
      skipped += 1;
      warnings.push(`Customer not found for job "${row.jobNumber}".`);
      return;
    }

    const requiredExpertises = normalizeRequiredExpertiseNames(row.requiredExpertises);

    if (mode === 'create') {
      const dup = byJobNumber.get(row.jobNumber.trim().toLowerCase());
      if (dup) {
        skipped += 1;
        warnings.push(`Job number already exists: ${row.jobNumber}`);
        return;
      }

      const job = await prisma.$transaction(async (tx) => {
        const createdJob = await tx.job.create({
          data: {
            ...buildParentJobCreateData(row, customerId),
            companyId,
            createdBy: userId,
            source: 'LOCAL',
            externalJobId: null,
            finishedGoods: [],
          },
        });
        await syncJobContacts(tx, {
          companyId,
          jobId: createdJob.id,
          contacts: row.contactsJson,
        });
        await syncJobRequiredExpertises(tx, {
          companyId,
          jobId: createdJob.id,
          names: requiredExpertises,
        });
        return createdJob;
      });
      byId.set(job.id, { id: job.id, jobNumber: job.jobNumber, source: 'LOCAL', customerId: job.customerId });
      byJobNumber.set(job.jobNumber.trim().toLowerCase(), {
        id: job.id,
        jobNumber: job.jobNumber,
        source: 'LOCAL',
        customerId: job.customerId,
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
        data: buildParentJobUpdatePatch(row, customerId),
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
