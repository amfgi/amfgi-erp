import type { PartyMasterSourceMode } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  fetchExternalClients,
  fetchExternalSuppliers,
  mapPartyToCustomerFields,
  type PartyListParty,
} from '@/lib/partyListsApi';
import {
  syncCustomerContacts,
  syncSupplierContacts,
} from '@/lib/partyContacts';

type PartyKind = 'customer' | 'supplier';

function assertPartySyncAllowed(mode: PartyMasterSourceMode | undefined, kind: PartyKind): void {
  if (mode === 'INTERNAL_ONLY') {
    const label = kind === 'customer' ? 'Customer' : 'Supplier';
    throw new Error(
      `${label} source mode is internal only. Party lists sync is disabled — switch mode on the company profile or use local records only.`
    );
  }
}

export type PartyListSyncResult = {
  ok: true;
  totalFromApi: number;
  created: number;
  updated: number;
};

async function upsertPartyListRows(companyId: string, kind: PartyKind, parties: PartyListParty[]): Promise<PartyListSyncResult> {
  const now = new Date();
  let created = 0;
  let updated = 0;

  for (const p of parties) {
    if (typeof p.id !== 'number' || !p.name?.trim()) continue;
    const { contacts, ...fields } = mapPartyToCustomerFields(p);

    if (kind === 'customer') {
      const existing = await prisma.customer.findUnique({
        where: { companyId_externalPartyId: { companyId, externalPartyId: p.id } },
      });

      await prisma.$transaction(async (tx) => {
        const customer = existing
          ? await tx.customer.update({
              where: { id: existing.id },
              data: { ...fields, externalSyncedAt: now, isActive: true },
            })
          : await tx.customer.create({
              data: {
                companyId,
                source: 'PARTY_API_SYNC',
                externalPartyId: p.id,
                externalSyncedAt: now,
                isActive: true,
                ...fields,
              },
            });
        await syncCustomerContacts(tx, {
          companyId,
          customerId: customer.id,
          contacts,
        });
      });
      if (existing) updated += 1;
      else created += 1;
      continue;
    }

    const existing = await prisma.supplier.findUnique({
      where: { companyId_externalPartyId: { companyId, externalPartyId: p.id } },
    });

    await prisma.$transaction(async (tx) => {
      const supplier = existing
        ? await tx.supplier.update({
            where: { id: existing.id },
            data: { ...fields, externalSyncedAt: now, isActive: true },
          })
        : await tx.supplier.create({
            data: {
              companyId,
              source: 'PARTY_API_SYNC',
              externalPartyId: p.id,
              externalSyncedAt: now,
              isActive: true,
              ...fields,
            },
          });
      await syncSupplierContacts(tx, {
        companyId,
        supplierId: supplier.id,
        contacts,
      });
    });
    if (existing) updated += 1;
    else created += 1;
  }

  return { ok: true, totalFromApi: parties.length, created, updated };
}

export async function syncExternalCustomersForCompany(companyId: string): Promise<PartyListSyncResult> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { customerSourceMode: true },
  });
  assertPartySyncAllowed(company?.customerSourceMode, 'customer');
  const parties = await fetchExternalClients();
  return upsertPartyListRows(companyId, 'customer', parties);
}

export async function syncExternalSuppliersForCompany(companyId: string): Promise<PartyListSyncResult> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { supplierSourceMode: true },
  });
  assertPartySyncAllowed(company?.supplierSourceMode, 'supplier');
  const parties = await fetchExternalSuppliers();
  return upsertPartyListRows(companyId, 'supplier', parties);
}
