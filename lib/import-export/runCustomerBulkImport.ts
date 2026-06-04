import type { PrismaClient } from '@prisma/client';
import { syncCustomerContacts } from '@/lib/partyContacts';
import type { CustomerImportRow } from '@/lib/import-export/customerFields';
import { mergePartyContactsForImport } from '@/lib/import-export/partyImportContacts';
import {
  primaryFromPartyContacts,
  prismaPartyFieldsFromBody,
} from '@/lib/partyListRecordPayload';
import type { BulkImportResult } from '@/lib/import-export/types';

type ExistingCustomer = {
  id: string;
  name: string;
  source: string;
};

export async function runCustomerBulkImport(
  prisma: PrismaClient,
  opts: {
    companyId: string;
    customerSourceMode: 'HYBRID' | 'EXTERNAL_ONLY' | 'INTERNAL_ONLY';
    newRows: CustomerImportRow[];
    updateRows: CustomerImportRow[];
  }
): Promise<BulkImportResult> {
  const { companyId, customerSourceMode, newRows, updateRows } = opts;
  const warnings: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const existing = await prisma.customer.findMany({
    where: { companyId },
    select: { id: true, name: true, source: true },
  });
  const byId = new Map(existing.map((c) => [c.id, c]));
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));

  const resolveExisting = (row: CustomerImportRow): ExistingCustomer | null => {
    if (row.id && byId.has(row.id)) return byId.get(row.id)!;
    const byNm = byName.get(row.name.trim().toLowerCase());
    return byNm ?? null;
  };

  const applyRow = async (row: CustomerImportRow, mode: 'create' | 'update', match: ExistingCustomer | null) => {
    if (mode === 'update' && match?.source === 'PARTY_API_SYNC') {
      skipped += 1;
      warnings.push(`Skipped synced customer "${match.name}" (party API).`);
      return;
    }
    if (mode === 'create' && customerSourceMode === 'EXTERNAL_ONLY') {
      skipped += 1;
      warnings.push(`Skipped create for "${row.name}" (company is external-only customers).`);
      return;
    }

    const mergedContacts = mergePartyContactsForImport(row);
    const party = prismaPartyFieldsFromBody({
      trade_license_number: row.trade_license_number,
      trade_license_authority: row.trade_license_authority,
      trade_license_expiry: row.trade_license_expiry,
      trn_number: row.trn_number,
      trn_expiry: row.trn_expiry,
      contacts: mergedContacts,
    });
    const fromContacts = primaryFromPartyContacts(mergedContacts);

    if (mode === 'create') {
      const dup = byName.get(row.name.trim().toLowerCase());
      if (dup) {
        skipped += 1;
        warnings.push(`Customer already exists: ${row.name}`);
        return;
      }

      const customer = await prisma.$transaction(async (tx) => {
        const createdRow = await tx.customer.create({
          data: {
            companyId,
            name: row.name.trim(),
            email: row.email?.trim() ? row.email.trim() : null,
            address: row.address?.trim() || null,
            contactPerson: (fromContacts.contactPerson ?? row.contactPerson?.trim()) || null,
            phone: (fromContacts.phone ?? row.phone?.trim()) || null,
            tradeLicenseNumber: party.tradeLicenseNumber,
            tradeLicenseAuthority: party.tradeLicenseAuthority,
            tradeLicenseExpiry: party.tradeLicenseExpiry,
            trnNumber: party.trnNumber,
            trnExpiry: party.trnExpiry,
            isActive: row.isActive ?? true,
            source: 'LOCAL',
            externalPartyId: null,
          },
        });
        await syncCustomerContacts(tx, {
          companyId,
          customerId: createdRow.id,
          contacts: party.contacts,
        });
        return createdRow;
      });
      byId.set(customer.id, { id: customer.id, name: customer.name, source: 'LOCAL' });
      byName.set(customer.name.trim().toLowerCase(), { id: customer.id, name: customer.name, source: 'LOCAL' });
      created += 1;
      return;
    }

    if (!match) {
      skipped += 1;
      warnings.push(`Update target not found: ${row.name}`);
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: match.id },
        data: {
          name: row.name.trim(),
          email: row.email?.trim() ? row.email.trim() : null,
          address: row.address?.trim() || null,
          contactPerson: (fromContacts.contactPerson ?? row.contactPerson?.trim()) || null,
          phone: (fromContacts.phone ?? row.phone?.trim()) || null,
          tradeLicenseNumber: party.tradeLicenseNumber,
          tradeLicenseAuthority: party.tradeLicenseAuthority,
          tradeLicenseExpiry: party.tradeLicenseExpiry,
          trnNumber: party.trnNumber,
          trnExpiry: party.trnExpiry,
          isActive: row.isActive ?? true,
        },
      });
      await syncCustomerContacts(tx, {
        companyId,
        customerId: match.id,
        contacts: mergedContacts,
      });
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
