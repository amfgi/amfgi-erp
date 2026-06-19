import type { PrismaClient } from '@prisma/client';
import { syncJobContacts } from '@/lib/jobs/jobContacts';
import { normalizeRequiredExpertiseNames, syncJobRequiredExpertises } from '@/lib/jobs/jobRequiredExpertises';
import {
  buildVariationJobCreateData,
  buildVariationJobUpdatePatch,
} from '@/lib/import-export/jobImportPatch';
import type { JobVariationImportRow } from '@/lib/import-export/jobVariationFields';
import type { BulkImportResult } from '@/lib/import-export/types';

type ParentJobRef = {
  id: string;
  jobNumber: string;
  customerId: string;
  source: string;
};

type ExistingVariation = {
  id: string;
  jobNumber: string;
  source: string;
  customerId: string;
  parentJobId: string | null;
};

function resolveVariationJobNumber(
  parent: ParentJobRef,
  row: JobVariationImportRow
): string | null {
  const suffix = row.variationSuffix?.trim();
  if (suffix) return `${parent.jobNumber}-${suffix}`;
  const explicit = row.jobNumber?.trim();
  if (explicit) return explicit;
  return null;
}

export async function runJobVariationBulkImport(
  prisma: PrismaClient,
  opts: {
    companyId: string;
    userId: string;
    newRows: JobVariationImportRow[];
    updateRows: JobVariationImportRow[];
  }
): Promise<BulkImportResult> {
  const { companyId, userId, newRows, updateRows } = opts;
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

  const parents = await prisma.job.findMany({
    where: { companyId, parentJobId: null },
    select: { id: true, jobNumber: true, customerId: true, source: true },
  });
  const parentById = new Map(parents.map((p) => [p.id, p]));
  const parentByNumber = new Map(parents.map((p) => [p.jobNumber.trim().toLowerCase(), p]));

  const variations = await prisma.job.findMany({
    where: { companyId, parentJobId: { not: null } },
    select: { id: true, jobNumber: true, source: true, customerId: true, parentJobId: true },
  });
  const variationById = new Map(variations.map((j) => [j.id, j]));
  const variationByNumber = new Map(variations.map((j) => [j.jobNumber.trim().toLowerCase(), j]));

  const resolveParent = (row: JobVariationImportRow, match?: ExistingVariation | null): ParentJobRef | null => {
    if (row.parentJobId && parentById.has(row.parentJobId)) return parentById.get(row.parentJobId)!;
    if (row.parentJobNumber) {
      return parentByNumber.get(row.parentJobNumber.trim().toLowerCase()) ?? null;
    }
    if (match?.parentJobId && parentById.has(match.parentJobId)) {
      return parentById.get(match.parentJobId)!;
    }
    const explicitJobNumber = row.jobNumber?.trim();
    if (explicitJobNumber) {
      const normalized = explicitJobNumber.toLowerCase();
      let best: ParentJobRef | null = null;
      let bestLen = 0;
      for (const parent of parents) {
        const key = parent.jobNumber.trim().toLowerCase();
        if (normalized.startsWith(`${key}-`) && key.length > bestLen) {
          best = parent;
          bestLen = key.length;
        }
      }
      if (best) return best;
    }
    return null;
  };

  const resolveCustomerId = (
    row: JobVariationImportRow,
    parent: ParentJobRef,
    fallbackCustomerId?: string,
  ): string | null => {
    if (row.customerId && customerById.has(row.customerId)) return row.customerId;
    if (row.customerName) {
      const match = customerByName.get(row.customerName.trim().toLowerCase());
      if (match) return match.id;
    }
    return fallbackCustomerId ?? parent.customerId;
  };

  const resolveExistingVariation = (row: JobVariationImportRow, jobNumber: string): ExistingVariation | null => {
    if (row.id && variationById.has(row.id)) return variationById.get(row.id)!;
    return variationByNumber.get(jobNumber.trim().toLowerCase()) ?? null;
  };

  const applyRow = async (row: JobVariationImportRow, mode: 'create' | 'update') => {
    const existingMatch =
      mode === 'update'
        ? resolveExistingVariation(row, row.jobNumber?.trim() ?? '') ??
          (row.id ? variationById.get(row.id) ?? null : null)
        : null;

    const parent = resolveParent(row, existingMatch);
    if (!parent) {
      skipped += 1;
      warnings.push(
        `Parent job not found for variation (parent: ${row.parentJobNumber ?? row.parentJobId ?? row.jobNumber ?? '?'})`
      );
      return;
    }

    const jobNumber =
      resolveVariationJobNumber(parent, row) ??
      existingMatch?.jobNumber ??
      row.jobNumber?.trim() ??
      null;
    if (!jobNumber) {
      skipped += 1;
      warnings.push(`Could not build job number for parent "${parent.jobNumber}"`);
      return;
    }

    const customerId = resolveCustomerId(row, parent, mode === 'update' ? existingMatch?.customerId : undefined);
    if (!customerId) {
      skipped += 1;
      warnings.push(`Customer not found for variation "${jobNumber}"`);
      return;
    }

    const match = mode === 'update' ? resolveExistingVariation(row, jobNumber) : null;
    if (mode === 'update' && match?.source === 'EXTERNAL_API') {
      skipped += 1;
      warnings.push(`Skipped synced variation "${match.jobNumber}" (external API).`);
      return;
    }

    const requiredExpertises = normalizeRequiredExpertiseNames(row.requiredExpertises);

    if (mode === 'create') {
      const dup = variationByNumber.get(jobNumber.trim().toLowerCase());
      if (dup) {
        skipped += 1;
        warnings.push(`Job number already exists: ${jobNumber}`);
        return;
      }

      const job = await prisma.$transaction(async (tx) => {
        const created = await tx.job.create({
          data: {
            ...buildVariationJobCreateData(row, jobNumber, customerId, parent.id),
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

      variationById.set(job.id, {
        id: job.id,
        jobNumber: job.jobNumber,
        source: 'LOCAL',
        customerId: job.customerId,
        parentJobId: job.parentJobId ?? parent.id,
      });
      variationByNumber.set(job.jobNumber.trim().toLowerCase(), {
        id: job.id,
        jobNumber: job.jobNumber,
        source: 'LOCAL',
        customerId: job.customerId,
        parentJobId: job.parentJobId ?? parent.id,
      });
      created += 1;
      return;
    }

    if (!match) {
      skipped += 1;
      warnings.push(`Update target not found: ${jobNumber}`);
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: match.id },
        data: buildVariationJobUpdatePatch(row, jobNumber, customerId, parent.id),
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
    await applyRow(row, 'create');
  }
  for (const row of updateRows) {
    await applyRow(row, 'update');
  }

  return { created, updated, skipped, warnings };
}
