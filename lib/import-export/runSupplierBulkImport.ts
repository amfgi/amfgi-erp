import type { PrismaClient } from '@prisma/client';
import { syncSupplierContacts } from '@/lib/partyContacts';
import {
  primaryFromPartyContacts,
  prismaPartyFieldsFromBody,
} from '@/lib/partyListRecordPayload';
import type { SupplierImportRow } from '@/lib/import-export/supplierFields';
import { mergePartyContactsForImport } from '@/lib/import-export/partyImportContacts';
import type { BulkImportResult } from '@/lib/import-export/types';

type ExistingSupplier = {
  id: string;
  name: string;
  source: string;
};

export async function runSupplierBulkImport(
  prisma: PrismaClient,
  opts: {
    companyId: string;
    supplierSourceMode: 'HYBRID' | 'EXTERNAL_ONLY' | 'INTERNAL_ONLY';
    newRows: SupplierImportRow[];
    updateRows: SupplierImportRow[];
  }
): Promise<BulkImportResult> {
  const { companyId, supplierSourceMode, newRows, updateRows } = opts;
  const warnings: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const existing = await prisma.supplier.findMany({
    where: { companyId },
    select: { id: true, name: true, source: true },
  });
  const byId = new Map(existing.map((s) => [s.id, s]));
  const byName = new Map(existing.map((s) => [s.name.trim().toLowerCase(), s]));

  const resolveExisting = (row: SupplierImportRow): ExistingSupplier | null => {
    if (row.id && byId.has(row.id)) return byId.get(row.id)!;
    const byNm = byName.get(row.name.trim().toLowerCase());
    return byNm ?? null;
  };

  const applyRow = async (row: SupplierImportRow, mode: 'create' | 'update', match: ExistingSupplier | null) => {
    if (mode === 'update' && match?.source === 'PARTY_API_SYNC') {
      skipped += 1;
      warnings.push(`Skipped synced supplier "${match.name}" (party API).`);
      return;
    }
    if (mode === 'create' && supplierSourceMode === 'EXTERNAL_ONLY') {
      skipped += 1;
      warnings.push(`Skipped create for "${row.name}" (company is external-only suppliers).`);
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
        warnings.push(`Supplier already exists: ${row.name}`);
        return;
      }

      const supplier = await prisma.$transaction(async (tx) => {
        const createdRow = await tx.supplier.create({
          data: {
            companyId,
            name: row.name.trim(),
            email: row.email?.trim() ? row.email.trim() : null,
            address: row.address?.trim() || null,
            city: row.city?.trim() || null,
            country: row.country?.trim() || null,
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
        await syncSupplierContacts(tx, {
          companyId,
          supplierId: createdRow.id,
          contacts: party.contacts,
        });
        return createdRow;
      });
      byId.set(supplier.id, { id: supplier.id, name: supplier.name, source: 'LOCAL' });
      byName.set(supplier.name.trim().toLowerCase(), { id: supplier.id, name: supplier.name, source: 'LOCAL' });
      created += 1;
      return;
    }

    if (!match) {
      skipped += 1;
      warnings.push(`Update target not found: ${row.name}`);
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.supplier.update({
        where: { id: match.id },
        data: {
          name: row.name.trim(),
          email: row.email?.trim() ? row.email.trim() : null,
          address: row.address?.trim() || null,
          city: row.city?.trim() || null,
          country: row.country?.trim() || null,
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
      await syncSupplierContacts(tx, {
        companyId,
        supplierId: match.id,
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
